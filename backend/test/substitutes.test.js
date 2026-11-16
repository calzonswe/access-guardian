import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSubstituteActive } from '../src/services/substitutes.js';

const row = { substitute_id: 'sub', substitute_from: '2026-07-01', substitute_to: '2026-07-31' };
const day = (s) => new Date(`${s}T12:00:00`);

test('active on the first and last day of the range', () => {
  assert.equal(isSubstituteActive(row, 'sub', day('2026-07-01')), true);
  assert.equal(isSubstituteActive(row, 'sub', day('2026-07-31')), true);
});

test('not active the day before or the day after', () => {
  assert.equal(isSubstituteActive(row, 'sub', day('2026-06-30')), false);
  assert.equal(isSubstituteActive(row, 'sub', day('2026-08-01')), false);
});

test('only for the named substitute', () => {
  assert.equal(isSubstituteActive(row, 'someone-else', day('2026-07-10')), false);
  assert.equal(isSubstituteActive({ ...row, substitute_id: null }, 'sub', day('2026-07-10')), false);
});

test('open-ended when dates are missing', () => {
  assert.equal(isSubstituteActive({ substitute_id: 'sub', substitute_from: null, substitute_to: null }, 'sub', day('2030-01-01')), true);
  assert.equal(isSubstituteActive({ substitute_id: 'sub', substitute_from: '2026-07-01', substitute_to: null }, 'sub', day('2026-06-01')), false);
});
