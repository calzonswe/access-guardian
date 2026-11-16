// Substitutes: a line manager can name a stand-in for a date range. While the
// range is active the stand-in acts as the manager for the manager's direct
// reports (approve/deny at the manager step, see the applications).
// The database helpers take the connection as a parameter so the rule itself
// stays testable without a database.

/** Local calendar date as 'YYYY-MM-DD'. */
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Is `userId` the active substitute on this manager row today?
 * `substitute_from` / `substitute_to` are inclusive 'YYYY-MM-DD' (or null = open).
 */
export function isSubstituteActive(row, userId, today = new Date()) {
  if (!row || !userId || row.substitute_id !== userId) return false;
  const t = isoDate(today);
  const from = row.substitute_from ? String(row.substitute_from).slice(0, 10) : null;
  const to = row.substitute_to ? String(row.substitute_to).slice(0, 10) : null;
  if (from && t < from) return false;
  if (to && t > to) return false;
  return true;
}

const ACTIVE_SQL = `(substitute_from IS NULL OR substitute_from <= CURRENT_DATE)
                AND (substitute_to IS NULL OR substitute_to >= CURRENT_DATE)`;

/** The active substitute of `managerId`, or null. */
export async function getActiveSubstituteId(db, managerId) {
  if (!managerId) return null;
  const { rows } = await db.query(
    `SELECT substitute_id FROM users
      WHERE id = $1 AND substitute_id IS NOT NULL AND ${ACTIVE_SQL}`,
    [managerId]
  );
  return rows[0]?.substitute_id || null;
}

/** Managers that `userId` currently stands in for. */
export async function getAbsentManagerIdsFor(db, userId) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE substitute_id = $1 AND is_active = true AND ${ACTIVE_SQL}`,
    [userId]
  );
  return rows.map(r => r.id);
}

/** Direct reports of the managers `userId` currently stands in for. */
export async function getSubstitutedReportIds(db, userId) {
  const managers = await getAbsentManagerIdsFor(db, userId);
  if (managers.length === 0) return [];
  const { rows } = await db.query('SELECT id FROM users WHERE manager_id = ANY($1)', [managers]);
  return rows.map(r => r.id);
}

/**
 * Validate substitute fields from a request. Returns { error } or { value }.
 * `value` holds only the fields that were sent (null clears them).
 */
export async function validateSubstitute(db, managerId, body) {
  const out = {};
  if (body.substitute_id !== undefined) {
    const sid = body.substitute_id || null;
    if (sid) {
      if (sid === managerId) return { error: 'Du kan inte vara din egen ersättare' };
      const { rows } = await db.query(
        `SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id
          WHERE u.id = $1 AND u.is_active = true AND r.role = 'line_manager'`,
        [sid]
      );
      if (rows.length === 0) return { error: 'Ersättaren måste vara en aktiv linjechef' };
    }
    out.substitute_id = sid;
  }
  for (const key of ['substitute_from', 'substitute_to']) {
    if (body[key] === undefined) continue;
    const v = body[key] || null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return { error: 'Ogiltigt datum för ersättare' };
    out[key] = v;
  }
  const from = out.substitute_from, to = out.substitute_to;
  if (from && to && to < from) return { error: 'Slutdatum för ersättare kan inte vara före startdatum' };
  return { value: out };
}
