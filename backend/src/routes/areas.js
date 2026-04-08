import { Router } from 'express';
import { pool } from '../db.js';
import { requireFacilityAccess, isFacilityAdminOrOwner } from '../middleware/rbac.js';

const router = Router();

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
    const { facility_id, name, description, security_level } = req.body;
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    const { rows } = await pool.query(
      'INSERT INTO areas (facility_id, name, description, security_level) VALUES ($1,$2,$3,$4) RETURNING *',
      [facility_id, name, description, security_level || 'low']
    );
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
    const { rows } = await pool.query(
      'UPDATE areas SET name=$1, description=$2, security_level=$3 WHERE id=$4 RETURNING *',
      [name, description, security_level, areaId]
    );
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
