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
