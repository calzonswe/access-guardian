// Who has to act on an application in a given status, and when a waiting
// application should be reminded about or escalated.
// The database helpers take the connection as a parameter (testable rules).
import { getActiveSubstituteId } from './substitutes.js';

const DAY_MS = 86400000;

/**
 * What to send for an application waiting in a pending status:
 * 'escalate' (to administrators), 'remind' (to its approvers) or null.
 * Each fires at most once per status (reminded_at / escalated_at are cleared
 * on every status change). A threshold of 0 disables that action.
 */
export function reminderAction(app, now, { remindAfterDays, escalateAfterDays }) {
  const since = new Date(app.status_changed_at).getTime();
  if (!Number.isFinite(since)) return null;
  const waitedDays = (now.getTime() - since) / DAY_MS;
  if (escalateAfterDays > 0 && waitedDays >= escalateAfterDays && !app.escalated_at) return 'escalate';
  if (remindAfterDays > 0 && waitedDays >= remindAfterDays && !app.reminded_at && !app.escalated_at) return 'remind';
  return null;
}

export async function activeAdministratorIds(db) {
  const { rows } = await db.query(
    `SELECT ur.user_id AS uid FROM user_roles ur JOIN users u ON u.id = ur.user_id
      WHERE ur.role = 'administrator' AND u.is_active = true`
  );
  return rows.map(r => r.uid);
}

/**
 * The people who decide the next step for an application in `status`.
 * `scope` comes from getApplicationScope (managerId, contactPersonId, facilityId).
 * Returns { ids, fallbackToAdmins } — the latter when nobody else can act.
 */
export async function approverIdsFor(db, scope, status) {
  let ids = [];
  if (status === 'pending_manager') {
    ids = [scope.managerId, scope.contactPersonId, await getActiveSubstituteId(db, scope.managerId)];
  } else if (status === 'pending_facility') {
    const { rows } = await db.query(
      `SELECT owner_id AS uid FROM facilities WHERE id = $1 AND owner_id IS NOT NULL
       UNION SELECT user_id AS uid FROM facility_admins WHERE facility_id = $1`,
      [scope.facilityId]
    );
    ids = rows.map(r => r.uid);
  } else if (status === 'pending_exception') {
    const { rows } = await db.query('SELECT owner_id AS uid FROM facilities WHERE id = $1', [scope.facilityId]);
    ids = rows.map(r => r.uid);
  }
  ids = [...new Set(ids.filter(Boolean))];
  if (ids.length === 0 && status.startsWith('pending')) {
    return { ids: await activeAdministratorIds(db), fallbackToAdmins: true };
  }
  return { ids, fallbackToAdmins: false };
}
