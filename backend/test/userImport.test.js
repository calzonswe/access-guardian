import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoles, validateImportRow, generateTempPassword } from '../src/services/userImport.js';

test('roles accept Swedish labels and keys, separated by |', () => {
  assert.deepEqual(parseRoles('Linjechef|anställd'), ['line_manager', 'employee']);
  assert.deepEqual(parseRoles('facility_admin | Administratör'), ['facility_admin', 'administrator']);
  assert.deepEqual(parseRoles(''), ['employee']);
  assert.deepEqual(parseRoles(undefined), ['employee']);
});

test('unknown roles are rejected', () => {
  assert.equal(parseRoles('chef'), null);
  assert.equal(parseRoles('Anställd|superuser'), null);
});

test('a valid row is normalised', () => {
  const r = validateImportRow({ email: ' Anna@Foretag.se ', fornamn: 'Anna', efternamn: 'Berg', roller: 'Anställd', chef_email: 'BOSS@foretag.se' });
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'anna@foretag.se');
  assert.equal(r.value.full_name, 'Anna Berg');
  assert.equal(r.value.manager_email, 'boss@foretag.se');
  assert.deepEqual(r.value.roles, ['employee']);
});

test('invalid rows get a Swedish reason', () => {
  assert.equal(validateImportRow({ email: 'nope', fornamn: 'A', efternamn: 'B' }).ok, false);
  assert.match(validateImportRow({ email: 'a@b.se', fornamn: '', efternamn: 'B' }).error, /förnamn/i);
  assert.match(validateImportRow({ email: 'a@b.se', fornamn: 'A', efternamn: 'B', roller: 'chef' }).error, /roll/i);
  assert.match(validateImportRow({ email: 'a@b.se', fornamn: 'A', efternamn: 'B', chef_email: 'x' }).error, /chef/i);
});

test('temporary passwords meet the default policy', () => {
  for (let i = 0; i < 20; i++) {
    const p = generateTempPassword();
    assert.equal(p.length, 12);
    assert.match(p, /[A-Z]/); assert.match(p, /[a-z]/); assert.match(p, /[0-9]/); assert.match(p, /[^A-Za-z0-9]/);
  }
});
