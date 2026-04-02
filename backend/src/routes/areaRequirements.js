import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const areaId = req.query.area_id;
    let query = 'SELECT * FROM area_requirements';
    const params = [];
    if (areaId) {
      query += ' WHERE area_id = $1';
      params.push(areaId);
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { area_id, requirement_id } = req.body;
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
