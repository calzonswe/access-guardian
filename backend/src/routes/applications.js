import { Router } from 'express';
import { pool } from '../db.js';
import { isFacilityAdminOrOwner, getManagedUserIds } from '../middleware/rbac.js';
import { getOrgManagerForUser } from './org.js';
import { audit } from '../services/audit.js';
import { expandAreaAncestors } from '../services/areaTree.js';
import { notifyUser } from '../services/notify.js';
import { getActiveSubstituteId, getSubstitutedReportIds } from '../services/substitutes.js';
import { approverIdsFor } from '../services/approvers.js';

const router = Router();

const STATUS_ORDER = ['draft', 'pending_manager', 'pending_facility', 'pending_exception', 'approved', 'denied', 'expired'];

// Convert internal storage URL to a public-facing download URL
function mapAttachmentUrl(att) {
  if (!att || !att.file_url) return att;
  if (att.file_url.startsWith('fs:') || att.file_url.startsWith('data:')) {
    return { ...att, file_url: `/api/attachments/${att.id}/download` };
  }
  return att;
}
function mapApp(row) {
  if (Array.isArray(row.attachments)) {
    row.attachments = row.attachments.map(mapAttachmentUrl);
  }
  return row;
}

export async function getApplicationScope(appId) {
  const { rows } = await pool.query(
    `SELECT a.applicant_id, a.facility_id, a.status,
            COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids
     FROM applications a
     LEFT JOIN application_areas aa ON aa.application_id = a.id
     WHERE a.id = $1 GROUP BY a.id`,
    [appId]
  );
  if (rows.length === 0) return null;
  const app = rows[0];
  const facilityId = app.facility_id;
  let facilityAreaIds = [];
  if (app.area_ids && app.area_ids.length > 0) {
    facilityAreaIds = app.area_ids;
  } else {
    const { rows: areaRows } = await pool.query('SELECT id FROM areas WHERE facility_id = $1', [facilityId]);
    facilityAreaIds = areaRows.map(r => r.id);
  }
  const applicantId = app.applicant_id;
  const { rows: managerRows } = await pool.query(
    'SELECT manager_id, contact_person_id FROM users WHERE id = $1',
    [applicantId]
  );
  const managerId = managerRows[0]?.manager_id || await getOrgManagerForUser(applicantId);
  const contactPersonId = managerRows[0]?.contact_person_id;
  return { applicantId, facilityId, status: app.status, areaIds: app.area_ids, managerId, contactPersonId, facilityAreaIds };
}

/**
 * Who is the current user in relation to an application?
 * The applicant is never treated as their own approver.
 */
export async function getApplicationAccess(user, scope) {
  const roles = user.roles || [];
  const isAdmin = roles.includes('administrator');
  const isApplicant = scope.applicantId === user.id;
  let isApprovingManager = false;
  if (!isApplicant) {
    if (scope.managerId === user.id || scope.contactPersonId === user.id) {
      isApprovingManager = true;
    } else if (roles.includes('line_manager')) {
      const managed = await getManagedUserIds(user.id);
      isApprovingManager = managed.includes(scope.applicantId);
    }
    // An active substitute stands in for the applicant's manager.
    if (!isApprovingManager && scope.managerId) {
      isApprovingManager = (await getActiveSubstituteId(pool, scope.managerId)) === user.id;
    }
  }
  const isFacilityStaff = (roles.includes('facility_owner') || roles.includes('facility_admin')) &&
    await isFacilityAdminOrOwner(user.id, scope.facilityId);
  let isFacilityOwner = false;
  if (isFacilityStaff && roles.includes('facility_owner')) {
    const { rows } = await pool.query('SELECT 1 FROM facilities WHERE id = $1 AND owner_id = $2', [scope.facilityId, user.id]);
    isFacilityOwner = rows.length > 0;
  }
  return {
    isAdmin, isApplicant, isApprovingManager, isFacilityStaff, isFacilityOwner,
    canView: isAdmin || isApplicant || isApprovingManager || isFacilityStaff,
  };
}

/**
 * Allowed status transitions: from -> to -> predicate(access, app).
 * Administrators may perform every listed transition.
 */
const TRANSITIONS = {
  draft: {
    pending_manager: (a) => a.isApplicant,
  },
  pending_manager: {
    draft: (a) => a.isApplicant,
    pending_facility: (a, app) => a.isApprovingManager && !app.has_exception,
    pending_exception: (a, app) => a.isApprovingManager && app.has_exception,
    denied: (a) => a.isApprovingManager,
  },
  pending_facility: {
    approved: (a) => a.isFacilityStaff,
    denied: (a) => a.isFacilityStaff,
    pending_exception: (a) => a.isApplicant,
  },
  pending_exception: {
    // Exceptions (avsteg) are decided by the owner of the facility.
    approved: (a) => a.isFacilityOwner,
    denied: (a) => a.isFacilityOwner,
  },
  approved: {
    expired: (a) => a.isFacilityStaff, // revocation
  },
};

export function isTransitionAllowed(from, to, access, app) {
  const rule = TRANSITIONS[from]?.[to];
  if (!rule) return false;
  return access.isAdmin || rule(access, app);
}

async function validateAreas(client, facilityId, areaIds) {
  if (!Array.isArray(areaIds)) return 'Områden ogiltigt format';
  if (areaIds.length === 0) return null;
  const { rows } = await client.query(
    'SELECT id FROM areas WHERE facility_id = $1 AND id = ANY($2::uuid[])',
    [facilityId, areaIds]
  );
  return rows.length === new Set(areaIds).size ? null : 'Ogiltigt område för anläggningen';
}

function validateDates(start, end) {
  if (start && isNaN(new Date(start).getTime())) return 'Ogiltigt startdatum';
  if (end && isNaN(new Date(end).getTime())) return 'Ogiltigt slutdatum';
  if (start && end && new Date(end) < new Date(start)) return 'Slutdatum kan inte vara före startdatum';
  return null;
}

// Notify the people who must act on an application in its new status.
const APPROVER_MESSAGES = {
  pending_manager: ['Ny ansökan att attestera', 'En tillträdesansökan väntar på ditt godkännande.'],
  pending_facility: ['Ansökan väntar på anläggningens godkännande', 'En tillträdesansökan har godkänts av närmaste chef och väntar på din granskning.'],
  pending_exception: ['Undantagsbegäran att granska', 'En ansökan med avsteg från kraven väntar på ditt beslut som anläggningsägare.'],
};
async function notifyApprovers(appId, scope, newStatus, actorId) {
  if (!APPROVER_MESSAGES[newStatus]) return;
  const { ids, fallbackToAdmins } = await approverIdsFor(pool, scope, newStatus);
  // Nobody can act at this step: the administrators get it instead of it going unnoticed.
  const [title, message] = fallbackToAdmins
    ? ['Ansökan saknar beslutsfattare', 'Ingen närmaste chef, kontaktperson eller anläggningsansvarig kan fatta beslut om ansökan. Granska den eller tilldela en ansvarig.']
    : APPROVER_MESSAGES[newStatus];
  for (const uid of ids) {
    if (uid === actorId) continue;
    await notifyUser(pool, uid, { title, message, type: 'action_required', link: `/applications/${appId}` });
  }
}

const APP_SELECT = `SELECT a.*,
        COALESCE(array_agg(DISTINCT aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
          FILTER (WHERE att.id IS NOT NULL), '[]'
        ) AS attachments
 FROM applications a
 LEFT JOIN application_areas aa ON aa.application_id = a.id
 LEFT JOIN attachments att ON att.application_id = a.id`;

// Optional pagination: ?page&limit&search&status. Without page/limit the legacy array is returned.
function parsePaging(req) {
  if (req.query.page === undefined && req.query.limit === undefined) return null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Extra filters (search on applicant/facility name, status) appended to the scope conditions.
function buildAppFilters(req, params) {
  const conditions = [];
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(au.full_name ILIKE $${params.length} OR f.name ILIKE $${params.length})`);
  }
  if (req.query.status && req.query.status !== 'all' && STATUS_ORDER.includes(req.query.status)) {
    params.push(req.query.status);
    conditions.push(`a.status = $${params.length}`);
  }
  return conditions;
}

async function pagedAppQuery(req, res, scopeConditions, { hideOthersDrafts = false } = {}) {
  const paging = parsePaging(req);
  const params = [];
  const scope = scopeConditions(params);
  const filters = buildAppFilters(req, params);
  // Drafts are private until submitted: only the applicant sees them.
  if (hideOthersDrafts) {
    params.push(req.user.id);
    filters.push(`(a.status <> 'draft' OR a.applicant_id = $${params.length})`);
  }
  const all = [...scope, ...filters];
  const where = all.length ? `WHERE ${all.join(scope.length > 1 ? ' OR ' : ' AND ')}` : '';
  // Scope alternatives are OR-ed; filters must apply to all of them, so wrap scope in parens.
  const whereFinal = scope.length > 1 && filters.length
    ? `WHERE (${scope.join(' OR ')}) AND ${filters.join(' AND ')}`
    : where;
  const joinNames = filters.length
    ? ' LEFT JOIN users au ON au.id = a.applicant_id LEFT JOIN facilities f ON f.id = a.facility_id'
    : '';
  if (!paging) {
    const { rows } = await pool.query(
      `${APP_SELECT}${joinNames} ${whereFinal} GROUP BY a.id ORDER BY a.created_at DESC`,
      params
    );
    return res.json(rows.map(mapApp));
  }
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(DISTINCT a.id) AS n FROM applications a${joinNames} ${whereFinal}`,
    params
  );
  const total = parseInt(countRows[0].n, 10);
  const { rows } = await pool.query(
    `${APP_SELECT}${joinNames} ${whereFinal} GROUP BY a.id ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, paging.pageSize, paging.offset]
  );
  res.json({ data: rows.map(mapApp), total, page: paging.page, pageSize: paging.pageSize });
}

router.get('/', async (req, res) => {
  try {
    if (req.user.roles.includes('administrator')) {
      return pagedAppQuery(req, res, () => []);
    }
    const userId = req.user.id;
    // Collect applicant user IDs (for WHERE a.applicant_id = ANY)
    const applicantIds = new Set();
    applicantIds.add(userId);
    if (req.user.roles.includes('line_manager')) {
      const managed = await getManagedUserIds(userId);
      managed.forEach(id => applicantIds.add(id));
    }
    // Collect facility IDs (for WHERE a.facility_id = ANY)
    const facilityIds = [];
    if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const { rows: userFacilities } = await pool.query(
        `SELECT id FROM facilities WHERE owner_id = $1 OR id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)`,
        [userId]
      );
      userFacilities.forEach(r => facilityIds.push(r.id));
    }
    // Direct reports of managers this user currently stands in for
    (await getSubstitutedReportIds(pool, userId)).forEach(id => applicantIds.add(id));
    // Contractors that this user sponsors (contact_person_id)
    const { rows: sponsored } = await pool.query(
      `SELECT id FROM users WHERE contact_person_id = $1`,
      [userId]
    );
    sponsored.forEach(r => applicantIds.add(r.id));
    // Build scope conditions (OR-ed): own/team applications OR applications to own facilities
    const paging = parsePaging(req);
    const scopeConditions = (params) => {
      const conditions = [];
      if (applicantIds.size > 0) {
        params.push([...applicantIds]);
        conditions.push(`a.applicant_id = ANY($${params.length})`);
      }
      if (facilityIds.length > 0) {
        params.push(facilityIds);
        conditions.push(`a.facility_id = ANY($${params.length})`);
      }
      return conditions;
    };
    // Detect empty scope cheaply
    if (applicantIds.size === 0 && facilityIds.length === 0) {
      return res.json(paging ? { data: [], total: 0, page: paging.page, pageSize: paging.pageSize } : []);
    }
    return pagedAppQuery(req, res, scopeConditions, { hideOthersDrafts: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const scope = await getApplicationScope(req.params.id);
    if (!scope) return res.status(404).json({ error: 'Ej hittad' });
    const access = await getApplicationAccess(req.user, scope);
    if (!access.canView) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    res.json(await fetchApplication(pool, req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/applications/:id/history: the audit trail of one application
// (status changes, edits, attachments), oldest first. Same view rule as the application.
router.get('/:id/history', async (req, res) => {
  try {
    const scope = await getApplicationScope(req.params.id);
    if (!scope) return res.status(404).json({ error: 'Ej hittad' });
    const access = await getApplicationAccess(req.user, scope);
    if (!access.canView) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    const { rows } = await pool.query(
      `SELECT l.id, l.action, l.created_at, l.details, u.full_name AS actor_name
         FROM system_logs l LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.target_id = $1::uuid
           OR (l.target_type = 'attachment' AND l.details LIKE 'Ansökan: ' || $1::text || '%')
        ORDER BY l.created_at ASC
        LIMIT 500`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

async function fetchApplication(db, appId) {
  const { rows } = await db.query(`${APP_SELECT} WHERE a.id = $1 GROUP BY a.id`, [appId]);
  return rows[0] ? mapApp(rows[0]) : null;
}

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    let { applicant_id, facility_id, area_ids, status, start_date, end_date, has_exception, exception_justification, renewed_from_id } = req.body || {};
    const isPrivileged = req.user.roles.includes('administrator');
    if (!isPrivileged || !applicant_id) applicant_id = req.user.id;
    // New applications start as a draft or are submitted directly to the manager.
    if (status !== 'pending_manager') status = 'draft';
    if (!facility_id) return res.status(400).json({ error: 'Anläggning krävs' });
    if (!start_date) return res.status(400).json({ error: 'Startdatum krävs' });
    const dateErr = validateDates(start_date, end_date);
    if (dateErr) return res.status(400).json({ error: dateErr });
    const { rows: fac } = await client.query('SELECT id FROM facilities WHERE id = $1', [facility_id]);
    if (fac.length === 0) return res.status(400).json({ error: 'Ogiltig anläggning' });
    const areaErr = await validateAreas(client, facility_id, area_ids || []);
    if (areaErr) return res.status(400).json({ error: areaErr });

    // A renewal may only point at an earlier application of the same applicant.
    let renewedFrom = null;
    if (renewed_from_id) {
      const { rows: prev } = await client.query(
        `SELECT id FROM applications WHERE id = $1 AND applicant_id = $2 AND status IN ('approved', 'expired')`,
        [renewed_from_id, applicant_id]
      );
      renewedFrom = prev[0]?.id || null;
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO applications (applicant_id, facility_id, status, start_date, end_date, has_exception, exception_justification, renewed_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [applicant_id, facility_id, status, start_date, end_date || null, !!has_exception, has_exception ? exception_justification || null : null, renewedFrom]
    );
    const app = rows[0];
    const expandedAreaIds = await expandAreaAncestors(client, area_ids || []);
    for (const areaId of expandedAreaIds) {
      await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [app.id, areaId]);
    }
    await client.query('COMMIT');
    await audit({ req, action: 'application_created', targetId: app.id, targetType: 'application', details: `Anläggning: ${facility_id}, status: ${status}` });
    if (status === 'pending_manager') {
      const scope = await getApplicationScope(app.id);
      await notifyApprovers(app.id, scope, 'pending_manager', req.user.id);
    }
    res.status(201).json({ ...app, area_ids: expandedAreaIds, attachments: [] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

const EDITABLE_STATUSES = ['draft', 'pending_manager'];

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const appId = req.params.id;
    const body = req.body || {};
    await client.query('BEGIN');
    // Lock the row so concurrent approvals can't both pass the checks.
    const { rows: locked } = await client.query(
      'SELECT id, status, facility_id, has_exception FROM applications WHERE id = $1 FOR UPDATE',
      [appId]
    );
    if (locked.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ej hittad' });
    }
    const current = locked[0];
    const scope = await getApplicationScope(appId);
    const access = await getApplicationAccess(req.user, scope);
    if (!access.canView) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }

    const fail = async (status, error) => {
      await client.query('ROLLBACK');
      return res.status(status).json({ error });
    };

    // ---- Field edits: only the applicant while the application is still editable, or an admin.
    const fieldKeys = ['facility_id', 'start_date', 'end_date', 'area_ids', 'has_exception', 'exception_justification'];
    const editsFields = fieldKeys.some(k => body[k] !== undefined);
    if (editsFields) {
      const canEdit = access.isAdmin || (access.isApplicant && EDITABLE_STATUSES.includes(current.status));
      if (!canEdit) return fail(403, 'Ansökan kan inte ändras i detta stadium');
    }
    const facilityId = body.facility_id || current.facility_id;
    if (body.facility_id !== undefined) {
      const { rows: fac } = await client.query('SELECT id FROM facilities WHERE id = $1', [body.facility_id]);
      if (fac.length === 0) return fail(400, 'Ogiltig anläggning');
    }
    const dateErr = validateDates(body.start_date, body.end_date);
    if (dateErr) return fail(400, dateErr);
    if (body.area_ids !== undefined) {
      const areaErr = await validateAreas(client, facilityId, body.area_ids || []);
      if (areaErr) return fail(400, areaErr);
    }
    const hasException = body.has_exception !== undefined ? !!body.has_exception : current.has_exception;

    // ---- Status transition
    let newStatus = body.status;
    if (newStatus === current.status) newStatus = undefined;
    if (newStatus !== undefined) {
      if (!STATUS_ORDER.includes(newStatus)) return fail(400, 'Ogiltig status');
      if (!isTransitionAllowed(current.status, newStatus, access, { has_exception: hasException })) {
        return fail(403, 'Otillåten statusändring för din roll');
      }
    }
    if (body.denied_reason !== undefined && newStatus !== 'denied') {
      return fail(400, 'Avslagsanledning kan bara anges vid avslag');
    }
    if (body.revoke_reason !== undefined && newStatus !== 'expired') {
      return fail(400, 'Anledning till återkallelse kan bara anges vid återkallelse');
    }

    const now = new Date().toISOString();
    const updates = [];
    const vals = [];
    let idx = 1;
    const addField = (name, val) => { if (val !== undefined) { updates.push(`${name} = $${idx++}`); vals.push(val); } };
    addField('status', newStatus);
    if (newStatus !== undefined) {
      // A new status restarts the reminder clock (see reminderAction).
      updates.push('status_changed_at = now()', 'reminded_at = NULL', 'escalated_at = NULL');
    }
    addField('facility_id', body.facility_id);
    addField('start_date', body.start_date);
    addField('end_date', body.end_date === '' ? null : body.end_date);
    addField('has_exception', body.has_exception);
    addField('exception_justification', body.exception_justification);
    if (current.status === 'pending_manager' && (newStatus === 'pending_facility' || newStatus === 'pending_exception')) {
      addField('manager_approved_at', now);
      addField('manager_approved_by', req.user.id);
    }
    if (newStatus === 'approved' && current.status === 'pending_facility') {
      addField('facility_approved_at', now);
      addField('facility_approved_by', req.user.id);
    }
    if (newStatus === 'approved' && current.status === 'pending_exception') {
      addField('exception_approved_at', now);
      addField('exception_approved_by', req.user.id);
      addField('facility_approved_at', now);
      addField('facility_approved_by', req.user.id);
    }
    if (newStatus === 'denied') addField('denied_reason', body.denied_reason ? String(body.denied_reason).slice(0, 2000) : null);
    if (newStatus === 'expired') {
      // Revocation by a person (the expiry job sets 'expired' without these).
      addField('revoked_at', now);
      addField('revoked_by', req.user.id);
      addField('revoke_reason', body.revoke_reason ? String(body.revoke_reason).slice(0, 2000) : null);
    }
    if (updates.length > 0) {
      vals.push(appId);
      await client.query(`UPDATE applications SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
    }
    if (body.area_ids !== undefined || body.facility_id !== undefined) {
      await client.query('DELETE FROM application_areas WHERE application_id = $1', [appId]);
      for (const areaId of await expandAreaAncestors(client, body.area_ids || [])) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [appId, areaId]);
      }
    }
    await client.query('COMMIT');

    // ----- Post-commit: audit log + status-change notifications -----
    if (newStatus) {
      const titleMap = {
        pending_manager: ['Ansökan inskickad', 'Din ansökan har skickats in för granskning.'],
        pending_facility: ['Ansökan vidarebefordrad', 'Din ansökan har godkänts av närmaste chef och väntar på anläggningens godkännande.'],
        pending_exception: ['Undantagsbegäran skickad', 'Din ansökan har skickats vidare för undantagsbedömning hos anläggningsägaren.'],
        approved: ['Ansökan godkänd', 'Din tillträdesansökan har godkänts.'],
        denied: ['Ansökan nekad', `Din tillträdesansökan har nekats.${body.denied_reason ? ` Anledning: ${String(body.denied_reason).slice(0, 500)}` : ''}`],
        expired: ['Tillträde återkallat', `Ditt tillträde har återkallats.${body.revoke_reason ? ` Anledning: ${String(body.revoke_reason).slice(0, 500)}` : ''}`],
      };
      const tm = titleMap[newStatus];
      if (tm && scope.applicantId !== req.user.id) {
        await notifyUser(pool, scope.applicantId, {
          title: tm[0], message: tm[1],
          type: newStatus === 'denied' || newStatus === 'expired' ? 'warning' : 'info',
          link: `/applications/${appId}`,
        });
      }
      await notifyApprovers(appId, { ...scope, facilityId }, newStatus, req.user.id);
      await audit({
        req,
        action: newStatus === 'expired' ? 'access_revoked' : `application_${newStatus}`,
        targetId: appId,
        targetType: 'application',
        details: `Status: ${current.status} → ${newStatus}${body.denied_reason ? ` (${String(body.denied_reason).slice(0, 200)})` : ''}${body.revoke_reason ? ` (${String(body.revoke_reason).slice(0, 200)})` : ''}`,
      });
    } else {
      await audit({ req, action: 'application_updated', targetId: appId, targetType: 'application' });
    }

    res.json(await fetchApplication(pool, appId));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT applicant_id, status FROM applications WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const app = rows[0];
    if (app.applicant_id !== req.user.id && !req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    if (app.status !== 'draft' && app.status !== 'denied') {
      return res.status(400).json({ error: 'Kan endast ta bort utkast eller nekade ansökningar' });
    }
    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
    await audit({ req, action: 'application_deleted', targetId: req.params.id, targetType: 'application' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
