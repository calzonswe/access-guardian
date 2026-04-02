import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id;
    let query = 'SELECT * FROM notifications';
    const params = [];
    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }
    query += ' ORDER BY created_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { user_id, title, message, type, link } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO notifications (user_id, title, message, type, read, link) VALUES ($1,$2,$3,$4,false,$5) RETURNING *',
      [user_id, title, message || '', type || 'info', link]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id krävs' });
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
