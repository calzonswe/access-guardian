import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireRole, isManagerOf } from '../middleware/rbac.js';

const router = Router();

router.use(requireRole('administrator'));

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.department,
              u.title, u.phone, u.manager_id, u.contact_person_id, u.company,
              u.is_active, u.created_at,
              array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id ORDER BY u.full_name`
    );
    res.json(rows.map(r => ({ ...r, roles: r.roles || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user.id !== targetId && !req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...user } = rows[0];
    res.json({ ...user, roles: user.roles || [] });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (email, full_name, first_name, last_name, password_hash, department, title, phone, manager_id, contact_person_id, company, is_active, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING *`,
      [email, full_name, first_name, last_name, hash, department, title, phone, manager_id || null, contact_person_id || null, company, is_active ?? true]
    );
    const user = rows[0];
    if (roles?.length) {
      for (const role of roles) {
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.id, role]);
      }
    }
    await client.query('COMMIT');
    const { password_hash, ...pub } = user;
    res.status(201).json({ ...pub, roles: roles || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.constraint === 'users_email_key') return res.status(409).json({ error: 'E-postadressen används redan' });
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = req.params.id;
    const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active } = req.body;

    const updates = [];
    const vals = [];
    let idx = 1;
    const addField = (name, val) => { if (val !== undefined) { updates.push(`${name} = $${idx++}`); vals.push(val); } };

    addField('email', email);
    addField('full_name', full_name);
    addField('first_name', first_name);
    addField('last_name', last_name);
    addField('department', department);
    addField('title', title);
    addField('phone', phone);
    addField('manager_id', manager_id || null);
    addField('contact_person_id', contact_person_id || null);
    addField('company', company);
    addField('is_active', is_active);

    if (password) {
      const hash = await bcrypt.hash(password, 12);
      addField('password_hash', hash);
      addField('must_change_password', true);
    }

    if (updates.length > 0) {
      vals.push(targetId);
      await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
    }

    if (roles !== undefined) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [targetId]);
      for (const role of roles) {
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [targetId, role]);
      }
    }
    await client.query('COMMIT');

    // Return updated user
    const { rows } = await client.query(
      `SELECT u.*, array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...pub } = rows[0];
    res.json({ ...pub, roles: pub.roles || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(403).json({ error: 'Du kan inte ta bort ditt eget konto' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
