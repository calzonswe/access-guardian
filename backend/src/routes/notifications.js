import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (req.user.roles.includes('administrator')) {
      const userId = req.query.user_id;
      let query = 'SELECT * FROM notifications';
      const params = [];
      if (userId) {
        query += ' WHERE user_id = $1';
        params.push(userId);
      }
      query += ' ORDER BY created_at DESC LIMIT 200';
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') &&
        !req.user.roles.includes('facility_admin') &&
        !req.user.roles.includes('line_manager')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
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
    const { rows } = await pool.query('SELECT user_id FROM notifications WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (rows[0].user_id !== req.user.id && !req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    await pool.query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
