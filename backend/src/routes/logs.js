import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 1000');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { action, actor_id, target_id, target_type, details } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO system_logs (action, actor_id, target_id, target_type, details) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [action, actor_id, target_id || null, target_type || null, details]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
