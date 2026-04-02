import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { signToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true
       GROUP BY u.id`,
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });

    const token = signToken({ id: user.id, email: user.email, roles: user.roles.filter(Boolean) });
    res.json({
      token,
      user: mapUser(user),
      mustChangePassword: user.must_change_password,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, req.user.id]
    );
    // Return updated user
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) AS roles FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [req.user.id]
    );
    const token = signToken({ id: rows[0].id, email: rows[0].email, roles: rows[0].roles.filter(Boolean) });
    res.json({ token, user: mapUser(rows[0]), mustChangePassword: false });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) AS roles FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Användare hittades ej' });
    res.json({ user: mapUser(rows[0]), mustChangePassword: rows[0].must_change_password });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    roles: (row.roles || []).filter(Boolean),
    department: row.department,
    title: row.title,
    phone: row.phone,
    manager_id: row.manager_id,
    contact_person_id: row.contact_person_id,
    company: row.company,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

export default router;
