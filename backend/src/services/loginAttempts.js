/**
 * Persistent per-email login lockout backed by the login_attempts table.
 * Configured via system_settings.security (maxLoginAttempts, lockoutMinutes).
 */
import { pool } from '../db.js';
import { getSecuritySettings } from './settings.js';

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Returns { locked: boolean, remainingSeconds?: number } without mutating state.
 */
export async function checkLock(email) {
  const e = normalize(email);
  if (!e) return { locked: false };
  const { rows } = await pool.query(
    'SELECT locked_until FROM login_attempts WHERE email = $1',
    [e]
  );
  if (rows.length === 0) return { locked: false };
  const lu = rows[0].locked_until;
  if (!lu) return { locked: false };
  const ms = new Date(lu).getTime() - Date.now();
  if (ms <= 0) return { locked: false };
  return { locked: true, remainingSeconds: Math.ceil(ms / 1000) };
}

export async function recordFailure(email) {
  const e = normalize(email);
  if (!e) return { locked: false, attempts: 0 };
  const { maxLoginAttempts, lockoutMinutes } = await getSecuritySettings();
  const { rows } = await pool.query(
    `INSERT INTO login_attempts (email, failed_count, last_attempt_at)
     VALUES ($1, 1, now())
     ON CONFLICT (email) DO UPDATE SET
       failed_count = login_attempts.failed_count + 1,
       last_attempt_at = now()
     RETURNING failed_count`,
    [e]
  );
  const attempts = rows[0].failed_count;
  if (attempts >= maxLoginAttempts) {
    const until = new Date(Date.now() + lockoutMinutes * 60 * 1000);
    await pool.query(
      'UPDATE login_attempts SET locked_until = $1, failed_count = 0 WHERE email = $2',
      [until, e]
    );
    return { locked: true, attempts, lockoutMinutes };
  }
  return { locked: false, attempts, remaining: maxLoginAttempts - attempts };
}

export async function recordSuccess(email) {
  const e = normalize(email);
  if (!e) return;
  await pool.query(
    'UPDATE login_attempts SET failed_count = 0, locked_until = NULL WHERE email = $1',
    [e]
  );
}
