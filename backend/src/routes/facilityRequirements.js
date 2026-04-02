import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const facilityId = req.query.facility_id;
    let query = 'SELECT * FROM facility_requirements';
    const params = [];
    if (facilityId) {
      query += ' WHERE facility_id = $1';
      params.push(facilityId);
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { facility_id, requirement_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO facility_requirements (facility_id, requirement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [facility_id, requirement_id]
    );
    res.status(201).json(rows[0] || { facility_id, requirement_id });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { facility_id, requirement_id } = req.query;
    await pool.query(
      'DELETE FROM facility_requirements WHERE facility_id = $1 AND requirement_id = $2',
      [facility_id, requirement_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
