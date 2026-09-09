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

/**
 * May the sender address this recipient?
 * - administrator: anyone
 * - line_manager: own reports (direct or indirect) and own contractors
 * - facility_owner / facility_admin: users with an application to one of their facilities
 * - anyone: themselves
 */
async function canNotify(user, recipientId) {
  if (!recipientId) return false;
  if (recipientId === user.id) return true;
  if (user.roles.includes('administrator')) return true;

  if (user.roles.includes('line_manager')) {
    const { rows } = await pool.query(
      `WITH RECURSIVE reports AS (
         SELECT id FROM users WHERE manager_id = $1 OR contact_person_id = $1
         UNION
         SELECT u.id FROM users u JOIN reports r ON u.manager_id = r.id
       ) SELECT 1 FROM reports WHERE id = $2`,
      [user.id, recipientId]
    );
    if (rows.length > 0) return true;
  }

  if (user.roles.includes('facility_owner') || user.roles.includes('facility_admin')) {
    const { rows } = await pool.query(
      `SELECT 1 FROM applications a
        WHERE a.applicant_id = $2
          AND a.facility_id IN (
            SELECT id FROM facilities WHERE owner_id = $1
            UNION SELECT facility_id FROM facility_admins WHERE user_id = $1
          ) LIMIT 1`,
      [user.id, recipientId]
    );
    if (rows.length > 0) return true;
  }
  return false;
}

router.post('/', async (req, res) => {
  try {
    const { user_id, title, message, type, link } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Rubrik krävs' });
    if (!(await canNotify(req.user, user_id))) {
      return res.status(403).json({ error: 'Du kan inte skicka notiser till denna användare' });
    }
    const { rows } = await pool.query(
      'INSERT INTO notifications (user_id, title, message, type, read, link) VALUES ($1,$2,$3,$4,false,$5) RETURNING *',
      [user_id, String(title).slice(0, 255), message || '', type || 'info', link]
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
