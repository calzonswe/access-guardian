/**
 * Cached reader for system_settings.
 * Refreshes from the database every CACHE_TTL_MS, or when invalidate() is called.
 */
import { pool } from '../db.js';

const CACHE_TTL_MS = 30_000;
let cache = null;
let cacheExpires = 0;

const DEFAULTS = {
  security: {
    sessionTimeoutMinutes: 30,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
  },
  passwordPolicy: {
    minLength: 8,
    requireUpper: true,
    requireLower: true,
    requireDigit: true,
    requireSymbol: true,
  },
};

async function loadSettings() {
  const { rows } = await pool.query('SELECT key, value FROM system_settings');
  const out = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function getAllSettings() {
  const now = Date.now();
  if (!cache || now > cacheExpires) {
    try {
      cache = await loadSettings();
    } catch (err) {
      console.error('settings load failed:', err);
      cache = cache || {};
    }
    cacheExpires = now + CACHE_TTL_MS;
  }
  return cache;
}

export function invalidateSettingsCache() {
  cache = null;
  cacheExpires = 0;
}

export async function getSecuritySettings() {
  const s = await getAllSettings();
  const sec = (s && s.security) || {};
  return {
    sessionTimeoutMinutes: Number(sec.sessionTimeoutMinutes) > 0 ? Number(sec.sessionTimeoutMinutes) : DEFAULTS.security.sessionTimeoutMinutes,
    maxLoginAttempts: Number(sec.maxLoginAttempts) > 0 ? Number(sec.maxLoginAttempts) : DEFAULTS.security.maxLoginAttempts,
    lockoutMinutes: Number(sec.lockoutMinutes) > 0 ? Number(sec.lockoutMinutes) : DEFAULTS.security.lockoutMinutes,
  };
}

export async function getPasswordPolicy() {
  const s = await getAllSettings();
  const p = (s && s.passwordPolicy) || {};
  const min = Number(p.minLength);
  return {
    minLength: min >= 6 && min <= 128 ? min : DEFAULTS.passwordPolicy.minLength,
    requireUpper: p.requireUpper !== false,
    requireLower: p.requireLower !== false,
    requireDigit: p.requireDigit !== false,
    requireSymbol: p.requireSymbol !== false,
  };
}

/**
 * Validate a password against a policy. Returns null on success, or a
 * human-readable Swedish error message on failure.
 */
export function validatePassword(pw, policy) {
  if (!pw || typeof pw !== 'string') return 'Lösenord krävs';
  if (pw.length < policy.minLength) return `Lösenordet måste vara minst ${policy.minLength} tecken`;
  const missing = [];
  if (policy.requireUpper && !/[A-Z]/.test(pw)) missing.push('stora bokstäver');
  if (policy.requireLower && !/[a-z]/.test(pw)) missing.push('små bokstäver');
  if (policy.requireDigit && !/[0-9]/.test(pw)) missing.push('siffror');
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) missing.push('specialtecken');
  if (missing.length) return `Lösenordet måste innehålla ${missing.join(', ')}`;
  return null;
}
