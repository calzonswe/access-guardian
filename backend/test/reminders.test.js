import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reminderAction } from '../src/services/approvers.js';

const now = new Date('2026-11-16T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const cfg = { remindAfterDays: 3, escalateAfterDays: 7 };
const app = (days, extra = {}) => ({ status_changed_at: daysAgo(days), reminded_at: null, escalated_at: null, ...extra });

test('nothing before the reminder threshold', () => {
  assert.equal(reminderAction(app(2), now, cfg), null);
});

test('one reminder after the threshold', () => {
  assert.equal(reminderAction(app(3), now, cfg), 'remind');
  assert.equal(reminderAction(app(4, { reminded_at: daysAgo(1) }), now, cfg), null);
});

test('escalation after its threshold, once', () => {
  assert.equal(reminderAction(app(7, { reminded_at: daysAgo(4) }), now, cfg), 'escalate');
  assert.equal(reminderAction(app(9, { reminded_at: daysAgo(6), escalated_at: daysAgo(2) }), now, cfg), null);
});

test('escalation wins when both are due and nothing was sent', () => {
  assert.equal(reminderAction(app(10), now, cfg), 'escalate');
});

test('0 disables an action', () => {
  assert.equal(reminderAction(app(5), now, { remindAfterDays: 0, escalateAfterDays: 7 }), null);
  assert.equal(reminderAction(app(10, { reminded_at: daysAgo(5) }), now, { remindAfterDays: 3, escalateAfterDays: 0 }), null);
});
