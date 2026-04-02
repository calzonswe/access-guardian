import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const facilityId = req.query.facility_id;
    let query = 'SELECT * FROM areas';
    const params = [];
    if (facilityId) {
      query += ' WHERE facility_id = $1';
      params.push(facilityId);
    }
    query += ' ORDER BY name';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM areas WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { facility_id, name, description, security_level } = req.body;
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
    const { name, description, security_level } = req.body;
    const { rows } = await pool.query(
      'UPDATE areas SET name=$1, description=$2, security_level=$3 WHERE id=$4 RETURNING *',
      [name, description, security_level, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM areas WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
