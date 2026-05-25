// ============= Audit logging helper =============
// Centralised wrapper around system_logs INSERTs so routes don't repeat
// boilerplate and so we can extend logging behaviour in one place later.
//
// Usage:
//   import { audit } from '../services/audit.js';
//   await audit({ req, action: 'user_updated', targetId: id, targetType: 'user', details: '...' });
//
// All fields except `action` are optional. Never throws — failure to log
// must never break the actual mutation, so we swallow errors.

import { pool } from '../db.js';

export async function audit({ req, client, action, actorId, targetId, targetType, details }) {
  const db = client || pool;
  const actor = actorId ?? req?.user?.id ?? null;
  try {
    await db.query(
      `INSERT INTO system_logs (action, actor_id, target_id, target_type, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, actor, targetId || null, targetType || null, details ? String(details).slice(0, 2000) : null]
    );
  } catch (err) {
    // Loud failure: audit gaps are a security concern.
    console.error(`[audit] FAILED to log action="${action}" target=${targetType || ''}:${targetId || ''} -- ${err.message}`);
  }
}
