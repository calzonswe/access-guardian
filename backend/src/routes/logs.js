import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(requireRole('administrator'));

router.get('/', async (req, res) => {
  try {
    const paginated = 'page' in req.query || 'pageSize' in req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 100));
    const action = req.query.action ? String(req.query.action) : null;

    const where = [];
    const params = [];
    if (action) { params.push(action); where.push(`action = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    if (!paginated) {
      const { rows } = await pool.query(
        `SELECT * FROM system_logs ${whereSql} ORDER BY created_at DESC LIMIT 1000`,
        params
      );
      return res.json(rows);
    }

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM system_logs ${whereSql}`, params),
      pool.query(
        `SELECT * FROM system_logs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
    ]);
    res.json({ items: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { action, target_id, target_type, details } = req.body;
    const actor_id = req.user.id;
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
