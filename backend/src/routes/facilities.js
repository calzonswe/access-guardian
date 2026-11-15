import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole, requireFacilityAccess, isFacilityAdminOrOwner } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';

const router = Router();

// Facility rows with admin ids plus the names of the owner and admins, so
// owners and facility admins can show them without access to /api/users.
const FACILITY_SELECT = `SELECT f.*, ou.full_name AS owner_name,
         COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids,
         COALESCE(json_agg(json_build_object('id', au.id, 'full_name', au.full_name))
                  FILTER (WHERE au.id IS NOT NULL), '[]') AS admins
    FROM facilities f
    LEFT JOIN users ou ON ou.id = f.owner_id
    LEFT JOIN facility_admins fa ON fa.facility_id = f.id
    LEFT JOIN users au ON au.id = fa.user_id`;

// Users that can be appointed facility admin (for owners, who can't list users).
router.get('/admin-candidates', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator') && !req.user.roles.includes('facility_owner')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, array_agg(ur.role::text) AS roles
         FROM users u JOIN user_roles ur ON ur.user_id = u.id
        WHERE u.is_active = true
          AND u.id IN (SELECT user_id FROM user_roles WHERE role IN ('facility_admin', 'administrator'))
        GROUP BY u.id ORDER BY u.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (req.user.roles.includes('administrator')) {
      const { rows } = await pool.query(
        `${FACILITY_SELECT} GROUP BY f.id, ou.full_name ORDER BY f.name`
      );
      return res.json(rows);
    }
    if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const { rows } = await pool.query(
        `${FACILITY_SELECT}
         WHERE f.owner_id = $1 OR f.id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)
         GROUP BY f.id, ou.full_name ORDER BY f.name`,
        [req.user.id]
      );
      return res.json(rows);
    }
    // Employees, contractors, line_managers: return basic facility info (id, name) for display purposes
    const { rows } = await pool.query(
      `SELECT f.id, f.name, f.description, f.address, f.created_at, '{}' AS admin_ids, NULL AS owner_id
       FROM facilities f ORDER BY f.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const facilityId = req.params.id;
    const { rows } = await pool.query(
      `SELECT f.*,
              COALESCE(array_agg(fa.user_id) FILTER (WHERE fa.user_id IS NOT NULL), '{}') AS admin_ids
       FROM facilities f LEFT JOIN facility_admins fa ON fa.facility_id = f.id
       WHERE f.id = $1 GROUP BY f.id`,
      [facilityId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!req.user.roles.includes('administrator')) {
      const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
      if (!hasAccess) return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { name, description, address, owner_id } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Namn krävs' });
    }
    const facilityOwnerId = owner_id || req.user.id;
    const { rows } = await pool.query(
      'INSERT INTO facilities (name, description, address, owner_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description, address, facilityOwnerId]
    );
    await audit({ req, action: 'facility_created', targetId: rows[0].id, targetType: 'facility', details: `Namn: ${name}` });
    res.status(201).json({ ...rows[0], admin_ids: [] });
  } catch (err) {
    console.error('Facility creation error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', requireFacilityAccess('id'), async (req, res) => {
  try {
    const facilityId = req.params.id;
    const { name, description, address, owner_id } = req.body || {};
    const { rows: current } = await pool.query('SELECT owner_id FROM facilities WHERE id = $1', [facilityId]);
    if (current.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Namn krävs' });
    // Only administrators and the current owner may hand over ownership.
    const isAdmin = req.user.roles.includes('administrator');
    if (owner_id && owner_id !== current[0].owner_id && !isAdmin && current[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Endast ägaren eller en administratör kan byta ägare' });
    }
    const updates = [];
    const vals = [];
    const add = (col, val) => { if (val !== undefined) { vals.push(val); updates.push(`${col} = $${vals.length}`); } };
    add('name', name !== undefined ? String(name).trim() : undefined);
    add('description', description);
    add('address', address);
    add('owner_id', owner_id || undefined);
    let row;
    if (updates.length > 0) {
      vals.push(facilityId);
      const { rows } = await pool.query(`UPDATE facilities SET ${updates.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
      row = rows[0];
    } else {
      const { rows } = await pool.query('SELECT * FROM facilities WHERE id = $1', [facilityId]);
      row = rows[0];
    }
    const admins = await pool.query('SELECT user_id FROM facility_admins WHERE facility_id = $1', [facilityId]);
    await audit({ req, action: 'facility_updated', targetId: facilityId, targetType: 'facility' });
    res.json({ ...row, admin_ids: admins.rows.map(r => r.user_id) });
  } catch (err) {
    console.error('Facility update error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    await pool.query('DELETE FROM facilities WHERE id = $1', [req.params.id]);
    await audit({ req, action: 'facility_deleted', targetId: req.params.id, targetType: 'facility' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// Only system administrators or the facility OWNER may appoint/remove facility admins.
async function canManageAdmins(req, facilityId) {
  if (req.user.roles.includes('administrator')) return true;
  const { rows } = await pool.query('SELECT 1 FROM facilities WHERE id = $1 AND owner_id = $2', [facilityId, req.user.id]);
  return rows.length > 0;
}

router.post('/:id/admins', async (req, res) => {
  try {
    const facilityId = req.params.id;
    if (!(await canManageAdmins(req, facilityId))) {
      return res.status(403).json({ error: 'Endast anläggningsägare eller systemadministratör kan utse administratörer' });
    }
    const { user_id } = req.body;
    await pool.query(
      'INSERT INTO facility_admins (facility_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [facilityId, user_id]
    );
    await audit({ req, action: 'facility_admin_added', targetId: facilityId, targetType: 'facility', details: `Användare: ${user_id}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id/admins/:userId', async (req, res) => {
  try {
    const facilityId = req.params.id;
    if (!(await canManageAdmins(req, facilityId))) {
      return res.status(403).json({ error: 'Endast anläggningsägare eller systemadministratör kan ta bort administratörer' });
    }
    await pool.query(
      'DELETE FROM facility_admins WHERE facility_id = $1 AND user_id = $2',
      [facilityId, req.params.userId]
    );
    await audit({ req, action: 'facility_admin_removed', targetId: facilityId, targetType: 'facility', details: `Användare: ${req.params.userId}` });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
