import { Router } from 'express';
import { pool } from '../db.js';
import { isFacilityAdminOrOwner } from '../middleware/rbac.js';

const router = Router();

// Read access for every authenticated user: applicants need to see which
// requirements apply to an area. Writes remain administrator-only.
router.get('/', async (req, res) => {
  try {
    const areaId = req.query.area_id;
    let query = 'SELECT * FROM area_requirements';
    const params = [];
    if (areaId) { query += ' WHERE area_id = $1'; params.push(areaId); }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { area_id, requirement_id } = req.body;
    if (!req.user.roles.includes('administrator')) {
      const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [area_id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Område ej funnet' });
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, rows[0].facility_id);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    }
    const { rows } = await pool.query(
      'INSERT INTO area_requirements (area_id, requirement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *',
      [area_id, requirement_id]
    );
    res.status(201).json(rows[0] || { area_id, requirement_id });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { area_id, requirement_id } = req.query;
    if (!req.user.roles.includes('administrator')) {
      const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [area_id]);
      if (rows.length > 0) {
        const hasAccess = await isFacilityAdminOrOwner(req.user.id, rows[0].facility_id);
        if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
      }
    }
    await pool.query(
      'DELETE FROM area_requirements WHERE area_id = $1 AND requirement_id = $2',
      [area_id, requirement_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
