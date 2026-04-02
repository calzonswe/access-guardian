import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*,
              COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
       FROM facilities f
       LEFT JOIN facility_admins fa ON fa.facility_id = f.id
       GROUP BY f.id ORDER BY f.name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*,
              COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
       FROM facilities f LEFT JOIN facility_admins fa ON fa.facility_id = f.id
       WHERE f.id = $1 GROUP BY f.id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, address, owner_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO facilities (name, description, address, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description, address, owner_id]
    );
    res.status(201).json({ ...rows[0], admin_ids: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, description, address, owner_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE facilities SET name=$1, description=$2, address=$3, owner_id=$4 WHERE id=$5 RETURNING *`,
      [name, description, address, owner_id, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    // Get admin_ids
    const admins = await pool.query('SELECT user_id FROM facility_admins WHERE facility_id = $1', [req.params.id]);
    res.json({ ...rows[0], admin_ids: admins.rows.map(r => r.user_id) });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM facilities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// Facility admins
router.post('/:id/admins', async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query(
      'INSERT INTO facility_admins (facility_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id/admins/:userId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM facility_admins WHERE facility_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
