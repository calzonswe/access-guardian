// CSV user import: row validation, role parsing and temporary passwords.
// Pure functions (no database) so they can be unit-tested.
import { randomBytes } from 'crypto';

const ROLE_ALIASES = {
  administrator: 'administrator', 'administratör': 'administrator',
  facility_owner: 'facility_owner', 'anläggningsägare': 'facility_owner',
  facility_admin: 'facility_admin', 'anläggningsadministratör': 'facility_admin',
  line_manager: 'line_manager', linjechef: 'line_manager',
  employee: 'employee', 'anställd': 'employee',
  contractor: 'contractor', 'entreprenör': 'contractor',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 'Linjechef|anställd' -> ['line_manager','employee']; empty -> ['employee']; unknown -> null. */
export function parseRoles(value) {
  const parts = String(value ?? '').split('|').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return ['employee'];
  const roles = [];
  for (const p of parts) {
    const r = ROLE_ALIASES[p];
    if (!r) return null;
    if (!roles.includes(r)) roles.push(r);
  }
  return roles;
}

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Validate one CSV row (keys are the lowercased template headers).
 * Returns { ok: true, value } with normalised fields, or { ok: false, error }.
 */
export function validateImportRow(row) {
  const email = clean(row.email, 255).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Ogiltig e-postadress' };
  const first = clean(row.fornamn, 128);
  const last = clean(row.efternamn, 128);
  if (!first) return { ok: false, error: 'Förnamn saknas' };
  if (!last) return { ok: false, error: 'Efternamn saknas' };
  const roles = parseRoles(row.roller);
  if (!roles) return { ok: false, error: `Okänd roll: ${clean(row.roller, 100)}` };
  const managerEmail = clean(row.chef_email, 255).toLowerCase();
  if (managerEmail && !EMAIL_RE.test(managerEmail)) return { ok: false, error: 'Ogiltig e-postadress för chef' };
  return {
    ok: true,
    value: {
      email,
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.slice(0, 255),
      phone: clean(row.telefon, 50),
      title: clean(row.befattning, 255),
      department: clean(row.avdelning, 100),
      company: clean(row.foretag, 255),
      manager_email: managerEmail || null,
      roles,
    },
  };
}

/** 12 characters with upper, lower, digit and symbol (passes the default policy). */
export function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const buf = randomBytes(12);
  const out = [upper[buf[0] % upper.length], lower[buf[1] % lower.length], digits[buf[2] % digits.length], symbols[buf[3] % symbols.length]];
  for (let i = 4; i < 12; i++) out.push(all[buf[i] % all.length]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
