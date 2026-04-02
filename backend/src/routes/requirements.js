import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM requirements ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, type, has_expiry, validity_days } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO requirements (name, description, type, has_expiry, validity_days) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, description, type, has_expiry ?? false, validity_days]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, description, type, has_expiry, validity_days } = req.body;
    const { rows } = await pool.query(
      'UPDATE requirements SET name=$1, description=$2, type=$3, has_expiry=$4, validity_days=$5 WHERE id=$6 RETURNING *',
      [name, description, type, has_expiry, validity_days, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM requirements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
