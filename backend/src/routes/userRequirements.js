import { Router } from 'express';
import { pool } from '../db.js';
import { getManagedUserIds } from '../middleware/rbac.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (req.user.roles.includes('administrator')) {
      let query = 'SELECT * FROM user_requirements';
      const params = [];
      if (userId) { query += ' WHERE user_id = $1'; params.push(userId); }
      query += ' ORDER BY fulfilled_at DESC';
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    if (req.user.roles.includes('line_manager') || req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const managed = await getManagedUserIds(req.user.id);
      const targetUserId = userId || req.user.id;
      if (targetUserId !== req.user.id && !managed.includes(targetUserId) && !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
      const { rows } = await pool.query(
        'SELECT * FROM user_requirements WHERE user_id = $1 ORDER BY fulfilled_at DESC',
        [targetUserId]
      );
      return res.json(rows);
    }
    const targetUserId = userId || req.user.id;
    if (targetUserId !== req.user.id) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    const { rows } = await pool.query(
      'SELECT * FROM user_requirements WHERE user_id = $1 ORDER BY fulfilled_at DESC',
      [targetUserId]
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
    let { user_id, requirement_id, fulfilled_at, expires_at, certified_by, status, attachment_name, attachment_data } = req.body;
    if (user_id !== req.user.id && !req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
      const managed = await getManagedUserIds(req.user.id);
      if (!managed.includes(user_id)) {
        return res.status(403).json({ error: 'Kan endast lägga till krav för egna eller underställda' });
      }
    }
    if (!req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') &&
        !req.user.roles.includes('facility_admin') &&
        !req.user.roles.includes('line_manager')) {
      user_id = req.user.id;
    }
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

router.put('/:id', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') &&
        !req.user.roles.includes('facility_admin') &&
        !req.user.roles.includes('line_manager')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { rows: existing } = await pool.query('SELECT user_id FROM user_requirements WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const ownerId = existing[0].user_id;
    if (ownerId !== req.user.id) {
      const managed = await getManagedUserIds(req.user.id);
      if (!managed.includes(ownerId) && !req.user.roles.includes('administrator') &&
          !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
    }
    const { fulfilled_at, expires_at, status, attachment_name, attachment_data } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;
    if (fulfilled_at !== undefined) { updates.push(`fulfilled_at = $${idx++}`); vals.push(fulfilled_at); }
    if (expires_at !== undefined) { updates.push(`expires_at = $${idx++}`); vals.push(expires_at); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); vals.push(status); }
    if (attachment_name !== undefined) { updates.push(`attachment_name = $${idx++}`); vals.push(attachment_name); }
    if (attachment_data !== undefined) { updates.push(`attachment_data = $${idx++}`); vals.push(attachment_data); }
    if (updates.length === 0) return res.status(400).json({ error: 'Inga fält att uppdatera' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE user_requirements SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM user_requirements WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const ownerId = existing[0].user_id;
    if (ownerId !== req.user.id && !req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin') &&
        !req.user.roles.includes('line_manager')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    if (ownerId !== req.user.id && !req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
      const managed = await getManagedUserIds(req.user.id);
      if (!managed.includes(ownerId)) {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
    }
    await pool.query('DELETE FROM user_requirements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
