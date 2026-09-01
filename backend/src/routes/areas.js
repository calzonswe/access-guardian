import { Router } from 'express';
import { pool } from '../db.js';
import { requireFacilityAccess, isFacilityAdminOrOwner } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';

const router = Router();

async function validateParent(parentId, facilityId, selfId = null) {
  if (!parentId) return null;
  if (parentId === selfId) return 'Ett område kan inte vara sitt eget överordnade';
  const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [parentId]);
  if (rows.length === 0) return 'Överordnat område hittades inte';
  if (rows[0].facility_id !== facilityId) return 'Överordnat område måste tillhöra samma anläggning';
  if (selfId) {
    const { rows: anc } = await pool.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id FROM areas WHERE id = $1
         UNION ALL
         SELECT a.id, a.parent_id FROM areas a JOIN chain c ON a.id = c.parent_id
       ) SELECT 1 FROM chain WHERE id = $2`,
      [parentId, selfId]
    );
    if (anc.length > 0) return 'Cirkulär områdesstruktur är inte tillåten';
  }
  return null;
}


router.get('/', async (req, res) => {
  try {
    const facilityId = req.query.facility_id;
    if (req.user.roles.includes('administrator')) {
      let query = 'SELECT * FROM areas';
      const params = [];
      if (facilityId) {
        query += ' WHERE facility_id = $1';
        params.push(facilityId);
      }
      query += ' ORDER BY name';
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const { rows: userFacilities } = await pool.query(
        `SELECT id FROM facilities WHERE owner_id = $1 OR id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)`,
        [req.user.id]
      );
      const facilityIds = userFacilities.map(r => r.id);
      if (facilityIds.length === 0) return res.json([]);
      let query = `SELECT * FROM areas WHERE facility_id = ANY($1)`;
      const params = [facilityIds];
      if (facilityId) {
        if (facilityIds.includes(facilityId)) {
          query += ' AND facility_id = $2';
          params.push(facilityId);
        } else {
          return res.json([]);
        }
      }
      query += ' ORDER BY name';
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM areas WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const area = rows[0];
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, area.facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    }
    res.json(area);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { facility_id, name, description, security_level, parent_id } = req.body;
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    const parentErr = await validateParent(parent_id || null, facility_id);
    if (parentErr) return res.status(400).json({ error: parentErr });
    const { rows } = await pool.query(
      'INSERT INTO areas (facility_id, name, description, security_level, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [facility_id, name, description, security_level || 'low', parent_id || null]
    );
    await audit({ req, action: 'area_created', targetId: rows[0].id, targetType: 'area', details: `Anläggning: ${facility_id}, namn: ${name}` });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const areaId = req.params.id;
    const { rows: areaRows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [areaId]);
    if (areaRows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, areaRows[0].facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    }
    const { name, description, security_level } = req.body;
    const parentId = req.body.parent_id !== undefined ? (req.body.parent_id || null) : undefined;
    if (parentId !== undefined) {
      const parentErr = await validateParent(parentId, areaRows[0].facility_id, areaId);
      if (parentErr) return res.status(400).json({ error: parentErr });
    }
    const { rows } = await pool.query(
      'UPDATE areas SET name=$1, description=$2, security_level=$3, parent_id=COALESCE($4, CASE WHEN $5::boolean THEN NULL ELSE parent_id END) WHERE id=$6 RETURNING *',
      [name, description, security_level, parentId ?? null, parentId !== undefined, areaId]
    );
    await audit({ req, action: 'area_updated', targetId: areaId, targetType: 'area' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const areaId = req.params.id;
    const { rows: areaRows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [areaId]);
    if (areaRows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, areaRows[0].facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    }
    await pool.query('DELETE FROM areas WHERE id = $1', [areaId]);
    await audit({ req, action: 'area_deleted', targetId: areaId, targetType: 'area' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
