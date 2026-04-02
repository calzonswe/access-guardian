import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id;
    let query = 'SELECT * FROM user_requirements';
    const params = [];
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY fulfilled_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, requirement_id, fulfilled_at, expires_at, certified_by, status, attachment_name, attachment_data } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO user_requirements (user_id, requirement_id, fulfilled_at, expires_at, certified_by, status, attachment_name, attachment_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [user_id, requirement_id, fulfilled_at || new Date().toISOString(), expires_at || null, certified_by || null, status || 'fulfilled', attachment_name || null, attachment_data || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_requirements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
