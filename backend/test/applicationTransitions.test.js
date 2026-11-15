// Pure-logic tests for the application status machine (no database needed).
process.env.DB_PASSWORD ??= 'test';
process.env.JWT_SECRET ??= 'x'.repeat(40);

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isTransitionAllowed } = await import('../src/routes/applications.js');

const none = { isAdmin: false, isApplicant: false, isApprovingManager: false, isFacilityStaff: false, isFacilityOwner: false };
const as = (overrides) => ({ ...none, ...overrides });
const plain = { has_exception: false };
const exc = { has_exception: true };

test('applicant submits a draft; nobody else (except admin) can', () => {
  assert.equal(isTransitionAllowed('draft', 'pending_manager', as({ isApplicant: true }), plain), true);
  assert.equal(isTransitionAllowed('draft', 'pending_manager', as({ isApprovingManager: true }), plain), false);
  assert.equal(isTransitionAllowed('draft', 'pending_manager', as({ isAdmin: true }), plain), true);
});

test('drafts cannot skip the manager step', () => {
  assert.equal(isTransitionAllowed('draft', 'pending_facility', as({ isApprovingManager: true }), plain), false);
  assert.equal(isTransitionAllowed('draft', 'approved', as({ isFacilityStaff: true, isFacilityOwner: true }), plain), false);
});

test('manager approval routes by has_exception', () => {
  const mgr = as({ isApprovingManager: true });
  assert.equal(isTransitionAllowed('pending_manager', 'pending_facility', mgr, plain), true);
  assert.equal(isTransitionAllowed('pending_manager', 'pending_exception', mgr, plain), false);
  assert.equal(isTransitionAllowed('pending_manager', 'pending_exception', mgr, exc), true);
  assert.equal(isTransitionAllowed('pending_manager', 'pending_facility', mgr, exc), false);
});

test('the applicant cannot approve their own application', () => {
  // getApplicationAccess never sets isApprovingManager for the applicant
  assert.equal(isTransitionAllowed('pending_manager', 'pending_facility', as({ isApplicant: true }), plain), false);
});

test('facility step needs staff of that facility', () => {
  assert.equal(isTransitionAllowed('pending_facility', 'approved', as({ isFacilityStaff: true }), plain), true);
  assert.equal(isTransitionAllowed('pending_facility', 'denied', as({ isFacilityStaff: true }), plain), true);
  assert.equal(isTransitionAllowed('pending_facility', 'approved', as({ isApprovingManager: true }), plain), false);
});

test('exceptions are decided by the facility owner, not facility admins', () => {
  assert.equal(isTransitionAllowed('pending_exception', 'approved', as({ isFacilityStaff: true, isFacilityOwner: true }), exc), true);
  assert.equal(isTransitionAllowed('pending_exception', 'approved', as({ isFacilityStaff: true }), exc), false);
  assert.equal(isTransitionAllowed('pending_exception', 'denied', as({ isFacilityStaff: true, isFacilityOwner: true }), exc), true);
});

test('revocation only by facility staff or admin', () => {
  assert.equal(isTransitionAllowed('approved', 'expired', as({ isFacilityStaff: true }), plain), true);
  assert.equal(isTransitionAllowed('approved', 'expired', as({ isApplicant: true }), plain), false);
  assert.equal(isTransitionAllowed('approved', 'expired', as({ isAdmin: true }), plain), true);
});

test('unknown transitions are rejected even for admins', () => {
  assert.equal(isTransitionAllowed('expired', 'approved', as({ isAdmin: true }), plain), false);
  assert.equal(isTransitionAllowed('approved', 'bogus', as({ isAdmin: true }), plain), false);
});
