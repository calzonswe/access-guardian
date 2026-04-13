import { Router } from 'express';
import { pool } from '../db.js';
import { isFacilityAdminOrOwner, isManagerOf, getManagedUserIds, getFacilityIdForArea } from '../middleware/rbac.js';

const router = Router();

const STATUS_ORDER = ['draft', 'pending_manager', 'pending_facility', 'pending_exception', 'approved', 'denied', 'expired'];

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
  const { rows: managerRows } = await pool.query('SELECT manager_id FROM users WHERE id = $1', [applicantId]);
  const managerId = managerRows[0]?.manager_id;
  const managedIds = managerId ? await getManagedUserIds(managerId) : [];
  const teamIds = new Set([...managedIds, applicantId]);
  return { applicantId, facilityId, status: app.status, areaIds: app.area_ids, managerId, teamIds, facilityAreaIds };
}

router.get('/', async (req, res) => {
  try {
    if (req.user.roles.includes('administrator')) {
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
         GROUP BY a.id ORDER BY a.created_at DESC`
      );
      return res.json(rows);
    }
    const userId = req.user.id;
    let appIds = new Set();
    appIds.add(userId);
    if (req.user.roles.includes('line_manager')) {
      const managed = await getManagedUserIds(userId);
      managed.forEach(id => appIds.add(id));
    }
    if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const { rows: userFacilities } = await pool.query(
        `SELECT id FROM facilities WHERE owner_id = $1 OR id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)`,
        [userId]
      );
      const facilityIds = userFacilities.map(r => r.id);
      if (facilityIds.length > 0) {
        const { rows: appRows } = await pool.query(
          'SELECT id FROM applications WHERE facility_id = ANY($1)',
          [facilityIds]
        );
        appRows.forEach(r => appIds.add(r.id));
      }
    }
    if (appIds.size === 0) return res.json([]);
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
       WHERE a.id = ANY($1)
       GROUP BY a.id ORDER BY a.created_at DESC`,
      [[...appIds]]
    );
    res.json(rows);
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
    res.json(rows[0]);
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
    if (area_ids?.length) {
      for (const areaId of area_ids) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [app.id, areaId]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...app, area_ids: area_ids || [], attachments: [] });
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
        const canApprove = req.user.roles.includes('line_manager') &&
          (scope.applicantId === req.user.id || scope.managerId === req.user.id || scope.teamIds.has(req.user.id));
        if (!canApprove && !req.user.roles.includes('administrator')) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Endast chef kan godkänna ansökan' });
        }
        if (scope.status !== 'draft' && scope.status !== 'pending_manager') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Fel ansökningsstatus för chef-godkännande' });
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
          (scope.status === 'pending_manager' && (req.user.roles.includes('line_manager') && (scope.managerId === req.user.id || scope.teamIds.has(req.user.id) || scope.applicantId === req.user.id))) ||
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
      for (const areaId of body.area_ids) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [appId, areaId]);
      }
    }
    await client.query('COMMIT');
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
    res.json(rows[0]);
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
