process.env.DB_PASSWORD ??= 'test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { shouldEmail } = await import('../src/services/notify.js');

test('categories are on unless switched off', () => {
  assert.equal(shouldEmail({}, 'action'), true);
  assert.equal(shouldEmail(null, 'expiry'), true);
  assert.equal(shouldEmail({ action: false }, 'action'), false);
  assert.equal(shouldEmail({ action: false }, 'status'), true);
});

test('messages without a category always go out', () => {
  assert.equal(shouldEmail({ action: false, status: false, expiry: false }, undefined), true);
});
