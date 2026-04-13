import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole, requireFacilityAccess, isFacilityAdminOrOwner } from '../middleware/rbac.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (req.user.roles.includes('administrator')) {
      const { rows } = await pool.query(
        `SELECT f.*,
                COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
         FROM facilities f
         LEFT JOIN facility_admins fa ON fa.facility_id = f.id
         GROUP BY f.id ORDER BY f.name`
      );
      return res.json(rows);
    }
    if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const { rows } = await pool.query(
        `SELECT f.*,
                COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
         FROM facilities f
         LEFT JOIN facility_admins fa ON fa.facility_id = f.id
         WHERE f.owner_id = $1 OR f.id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)
         GROUP BY f.id ORDER BY f.name`,
        [req.user.id]
      );
      return res.json(rows);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const facilityId = req.params.id;
    const { rows } = await pool.query(
      `SELECT f.*,
              COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
       FROM facilities f LEFT JOIN facility_admins fa ON fa.facility_id = f.id
       WHERE f.id = $1 GROUP BY f.id`,
      [facilityId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { name, description, address, owner_id } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Namn krävs' });
    }
    const facilityOwnerId = owner_id || req.user.id;
    const { rows } = await pool.query(
      'INSERT INTO facilities (name, description, address, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description, address, facilityOwnerId]
    );
    res.status(201).json({ ...rows[0], admin_ids: [] });
  } catch (err) {
    console.error('Facility creation error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', requireFacilityAccess('id'), async (req, res) => {
  try {
    const facilityId = req.params.id;
    const { name, description, address, owner_id } = req.body;
    const { rows: current } = await pool.query('SELECT owner_id FROM facilities WHERE id = $1', [facilityId]);
    if (current.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const newOwnerId = owner_id || current[0].owner_id;
    const { rows } = await pool.query(
      `UPDATE facilities SET name=$1, description=$2, address=$3, owner_id=$4 WHERE id=$5 RETURNING *`,
      [name, description, address, newOwnerId, facilityId]
    );
    const admins = await pool.query('SELECT user_id FROM facility_admins WHERE facility_id = $1', [facilityId]);
    res.json({ ...rows[0], admin_ids: admins.rows.map(r => r.user_id) });
  } catch (err) {
    console.error('Facility update error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    await pool.query('DELETE FROM facilities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/:id/admins', async (req, res) => {
  try {
    const facilityId = req.params.id;
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    const { user_id } = req.body;
    await pool.query(
      'INSERT INTO facility_admins (facility_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [facilityId, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id/admins/:userId', async (req, res) => {
  try {
    const facilityId = req.params.id;
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    await pool.query(
      'DELETE FROM facility_admins WHERE facility_id = $1 AND user_id = $2',
      [facilityId, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
