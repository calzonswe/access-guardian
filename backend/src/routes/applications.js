import { Router } from 'express';
import { pool } from '../db.js';
import { isFacilityAdminOrOwner, isManagerOf, getManagedUserIds, getFacilityIdForArea } from '../middleware/rbac.js';
import { sendMailToUser, isEmailEnabled } from '../services/email.js';
import { getOrgManagerForUser } from './org.js';
import { audit } from '../services/audit.js';
import { expandAreaAncestors } from '../services/areaTree.js';

// Notify a user both in-app and via email (best-effort)
async function notifyUser(client, userId, { title, message, type, link }) {
  if (!userId) return;
  try {
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, read, link)
       VALUES ($1,$2,$3,$4,false,$5)`,
      [userId, title, message, type, link || null]
    );
  } catch (err) {
    console.warn('[applications] notify insert failed:', err.message);
  }
  if (isEmailEnabled()) {
    sendMailToUser(userId, {
      subject: title,
      title,
      body: `<p>${message}</p>`,
      ctaLabel: link ? 'Öppna ansökan' : undefined,
      ctaUrl: link,
    }).catch(() => {});
  }
}

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
  const managedIds = managerId ? await getManagedUserIds(managerId) : [];
  const teamIds = new Set([...managedIds, applicantId]);
  return { applicantId, facilityId, status: app.status, areaIds: app.area_ids, managerId, contactPersonId, teamIds, facilityAreaIds };
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

async function pagedAppQuery(req, res, scopeConditions) {
  const paging = parsePaging(req);
  const params = [];
  const scope = scopeConditions(params);
  const filters = buildAppFilters(req, params);
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
    return pagedAppQuery(req, res, scopeConditions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const scope = await getApplicationScope(req.params.id);
    if (!scope) return res.status(404).json({ error: 'Ej hittad' });
    const canView = req.user.roles.includes('administrator') ||
      scope.applicantId === req.user.id ||
      scope.teamIds.has(req.user.id) ||
      (scope.managerId === req.user.id) ||
      (scope.contactPersonId === req.user.id) ||
      (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) && await isFacilityAdminOrOwner(req.user.id, scope.facilityId);
    if (!canView) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
              COALESCE(
                json_agg(json_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
                FILTER (WHERE att.id IS NOT NULL), '[]'
              ) AS attachments
       FROM applications a
       LEFT JOIN application_areas aa ON aa.application_id = a.id
       LEFT JOIN attachments att ON att.application_id = a.id
       WHERE a.id = $1 GROUP BY a.id`,
      [req.params.id]
    );
    res.json(mapApp(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let { applicant_id, facility_id, area_ids, status, start_date, end_date, has_exception, exception_justification } = req.body;
    if (!req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') &&
        !req.user.roles.includes('facility_admin')) {
      applicant_id = req.user.id;
    }
    if (status === 'pending_manager' || status === 'pending_facility' || status === 'pending_exception' || status === 'approved') {
      status = 'draft';
    }
    const { rows } = await client.query(
      `INSERT INTO applications (applicant_id, facility_id, status, start_date, end_date, has_exception, exception_justification)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [applicant_id, facility_id, status || 'draft', start_date, end_date || null, has_exception ?? false, exception_justification]
    );
    const app = rows[0];
    const expandedAreaIds = await expandAreaAncestors(client, area_ids || []);
    for (const areaId of expandedAreaIds) {
      await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [app.id, areaId]);
    }
    await client.query('COMMIT');
    await audit({ req, action: 'application_created', targetId: app.id, targetType: 'application', details: `Anläggning: ${facility_id}` });
    res.status(201).json({ ...app, area_ids: expandedAreaIds, attachments: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const appId = req.params.id;
    const scope = await getApplicationScope(appId);
    if (!scope) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ej hittad' });
    }
    const body = req.body;
    const now = new Date().toISOString();
    const newStatus = body.status;
    if (newStatus) {
      if (newStatus === 'pending_manager' && scope.status !== 'draft') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Kan inte skicka in ansökan i detta stadium' });
      }
      if (newStatus === 'pending_facility') {
        const isManager = req.user.roles.includes('line_manager') &&
          (scope.applicantId === req.user.id || scope.managerId === req.user.id || scope.teamIds.has(req.user.id));
        const isSponsor = scope.contactPersonId === req.user.id;
        const canApprove = isManager || isSponsor;
        if (!canApprove && !req.user.roles.includes('administrator')) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Endast chef eller kontaktperson kan godkänna ansökan' });
        }
        if (scope.status !== 'draft' && scope.status !== 'pending_manager') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Fel ansökningsstatus för godkännande' });
        }
      }
      if (newStatus === 'approved') {
        if (scope.status === 'pending_facility') {
          const hasFacilityAccess = (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) &&
            await isFacilityAdminOrOwner(req.user.id, scope.facilityId);
          if (!hasFacilityAccess && !req.user.roles.includes('administrator')) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Endast anläggningsägare/administratör kan godkänna ansökan' });
          }
        } else if (scope.status === 'pending_exception') {
          if (!req.user.roles.includes('administrator')) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Endast administratör kan godkänna undantag' });
          }
        } else {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Fel ansökningsstatus för godkännande' });
        }
      }
      if (newStatus === 'denied') {
        const canDeny = req.user.roles.includes('administrator') ||
          (scope.status === 'pending_manager' && (
            (req.user.roles.includes('line_manager') && (scope.managerId === req.user.id || scope.teamIds.has(req.user.id) || scope.applicantId === req.user.id)) ||
            scope.contactPersonId === req.user.id
          )) ||
          (scope.status === 'pending_facility' && (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin'))) ||
          (scope.status === 'pending_exception' && req.user.roles.includes('administrator'));
        if (!canDeny) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Otillräckliga rättigheter för att neka ansökan' });
        }
      }
      if (newStatus === 'pending_exception') {
        if (!req.user.roles.includes('administrator') && !(scope.status === 'pending_facility' && scope.applicantId === req.user.id)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Endast sökande kan begära undantag' });
        }
      }
      if (newStatus === 'draft' && scope.status !== 'draft' && scope.status !== 'pending_manager' && !req.user.roles.includes('administrator')) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Kan inte återställa ansökan' });
      }
    }
    const updates = [];
    const vals = [];
    let idx = 1;
    const addField = (name, val) => { if (val !== undefined) { updates.push(`${name} = $${idx++}`); vals.push(val); } };
    addField('status', newStatus);
    addField('start_date', body.start_date);
    addField('end_date', body.end_date);
    addField('has_exception', body.has_exception);
    addField('exception_justification', body.exception_justification);
    if (newStatus === 'pending_facility') {
      addField('manager_approved_at', now);
      addField('manager_approved_by', req.user.id);
    }
    if (newStatus === 'approved' && scope.status === 'pending_facility') {
      addField('facility_approved_at', now);
      addField('facility_approved_by', req.user.id);
    }
    if (newStatus === 'approved' && scope.status === 'pending_exception') {
      addField('exception_approved_at', now);
      addField('exception_approved_by', req.user.id);
    }
    addField('denied_reason', body.denied_reason);
    if (updates.length > 0) {
      vals.push(appId);
      await client.query(`UPDATE applications SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
    }
    if (body.area_ids !== undefined) {
      await client.query('DELETE FROM application_areas WHERE application_id = $1', [appId]);
      for (const areaId of await expandAreaAncestors(client, body.area_ids || [])) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [appId, areaId]);
      }
    }
    await client.query('COMMIT');

    // ----- Post-commit: audit log + status-change notifications -----
    if (newStatus && newStatus !== scope.status) {
      const titleMap = {
        pending_manager: ['Ansökan inskickad', 'Din ansökan har skickats in för granskning.'],
        pending_facility: ['Ansökan vidarebefordrad', 'Din ansökan har godkänts av närmaste chef och väntar på anläggningens godkännande.'],
        pending_exception: ['Undantagsbegäran skickad', 'Din ansökan har skickats vidare för undantagsbedömning.'],
        approved: ['Ansökan godkänd', 'Din tillträdesansökan har godkänts.'],
        denied: ['Ansökan nekad', `Din tillträdesansökan har nekats.${body.denied_reason ? ` Anledning: ${String(body.denied_reason).slice(0, 500)}` : ''}`],
      };
      const tm = titleMap[newStatus];
      if (tm) {
        await notifyUser(pool, scope.applicantId, {
          title: tm[0], message: tm[1],
          type: newStatus === 'denied' ? 'warning' : 'info',
          link: `/applications/${appId}`,
        });
      }
      // Notify next-step approvers
      if (newStatus === 'pending_facility') {
        const { rows: approvers } = await pool.query(
          `SELECT owner_id AS uid FROM facilities WHERE id = $1 AND owner_id IS NOT NULL
           UNION SELECT user_id AS uid FROM facility_admins WHERE facility_id = $1`,
          [scope.facilityId]
        );
        for (const a of approvers) {
          await notifyUser(pool, a.uid, {
            title: 'Ansökan väntar på anläggningens godkännande',
            message: 'En tillträdesansökan har godkänts av närmaste chef och väntar på din granskning.',
            type: 'action_required',
            link: `/applications/${appId}`,
          });
        }
      }
      if (newStatus === 'pending_exception') {
        const { rows: admins } = await pool.query(
          `SELECT user_id AS uid FROM user_roles WHERE role = 'administrator'`
        );
        for (const a of admins) {
          await notifyUser(pool, a.uid, {
            title: 'Undantagsbegäran att granska',
            message: 'En ansökan har eskalerats för undantagsbedömning.',
            type: 'action_required',
            link: `/applications/${appId}`,
          });
        }
      }
      await audit({
        req,
        action: `application_${newStatus}`,
        targetId: appId,
        targetType: 'application',
        details: `Status: ${scope.status} → ${newStatus}${body.denied_reason ? ` (${String(body.denied_reason).slice(0, 200)})` : ''}`,
      });
    } else {
      await audit({ req, action: 'application_updated', targetId: appId, targetType: 'application' });
    }

    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
              COALESCE(
                json_agg(json_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
                FILTER (WHERE att.id IS NOT NULL), '[]'
              ) AS attachments
       FROM applications a LEFT JOIN application_areas aa ON aa.application_id = a.id
       LEFT JOIN attachments att ON att.application_id = a.id
       WHERE a.id = $1 GROUP BY a.id`,
      [appId]
    );
    res.json(mapApp(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
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
