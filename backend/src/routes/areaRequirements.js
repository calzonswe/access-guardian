import { Router } from 'express';
import { pool } from '../db.js';
import { isFacilityAdminOrOwner } from '../middleware/rbac.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const areaId = req.query.area_id;
    if (req.user.roles.includes('administrator')) {
      let query = 'SELECT * FROM area_requirements';
      const params = [];
      if (areaId) { query += ' WHERE area_id = $1'; params.push(areaId); }
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
      let query = `SELECT ar.* FROM area_requirements ar JOIN areas a ON ar.area_id = a.id WHERE a.facility_id = ANY($1)`;
      const params = [facilityIds];
      if (areaId) {
        const { rows: areaRows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [areaId]);
        if (areaRows.length === 0 || !facilityIds.includes(areaRows[0].facility_id)) {
          return res.json([]);
        }
        query += ' AND ar.area_id = $2';
        params.push(areaId);
      }
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { area_id, requirement_id } = req.body;
    if (!req.user.roles.includes('administrator')) {
      const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [area_id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Område ej funnet' });
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, rows[0].facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    }
    const { rows } = await pool.query(
      'INSERT INTO area_requirements (area_id, requirement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [area_id, requirement_id]
    );
    res.status(201).json(rows[0] || { area_id, requirement_id });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { area_id, requirement_id } = req.query;
    if (!req.user.roles.includes('administrator')) {
      const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [area_id]);
      if (rows.length > 0) {
        const hasAccess = await isFacilityAdminOrOwner(req.user.id, rows[0].facility_id);
        if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
      }
    }
    await pool.query(
      'DELETE FROM area_requirements WHERE area_id = $1 AND requirement_id = $2',
      [area_id, requirement_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
