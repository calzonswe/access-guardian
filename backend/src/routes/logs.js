import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(requireRole('administrator'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/logs?page&pageSize&q&from&to&action
// q searches action, details and actor name; from/to are inclusive dates.
// Without page/pageSize the legacy array (latest 1000) is returned.
router.get('/', async (req, res) => {
  try {
    const paginated = 'page' in req.query || 'pageSize' in req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(10000, Math.max(1, parseInt(req.query.pageSize, 10) || 100));

    const where = [];
    const params = [];
    if (req.query.action && req.query.action !== 'all') {
      params.push(String(req.query.action));
      where.push(`l.action::text = $${params.length}`);
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      params.push(`%${q}%`);
      const i = params.length;
      where.push(`(l.action::text ILIKE $${i} OR l.details ILIKE $${i} OR u.full_name ILIKE $${i})`);
    }
    if (typeof req.query.from === 'string' && DATE_RE.test(req.query.from)) {
      params.push(req.query.from);
      where.push(`l.created_at >= $${params.length}::date`);
    }
    if (typeof req.query.to === 'string' && DATE_RE.test(req.query.to)) {
      params.push(req.query.to);
      where.push(`l.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = 'FROM system_logs l LEFT JOIN users u ON u.id = l.actor_id';

    if (!paginated) {
      const { rows } = await pool.query(
        `SELECT l.*, u.full_name AS actor_name ${from} ${whereSql} ORDER BY l.created_at DESC LIMIT 1000`,
        params
      );
      return res.json(rows);
    }

    const [{ rows: countRows }, { rows }] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total ${from} ${whereSql}`, params),
      pool.query(
        `SELECT l.*, u.full_name AS actor_name ${from} ${whereSql}
          ORDER BY l.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
    ]);
    res.json({ items: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    console.error(err);
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
