import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireRole, getManagedUserIds } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';
import { sendMail, isEmailEnabled } from '../services/email.js';
import { getPasswordPolicy, validatePassword } from '../services/settings.js';

const router = Router();

const USER_SELECT = `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.department,
              u.title, u.phone, u.manager_id, u.contact_person_id, u.company, u.org_unit_id,
              u.is_active, u.created_at,
              array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id`;

// GET /api/users — role-based filtering
router.get('/', async (req, res) => {
  try {
    const roles = req.user.roles;

    // Admins see all users
    if (roles.includes('administrator')) {
      const { rows } = await pool.query(
        `${USER_SELECT} GROUP BY u.id ORDER BY u.full_name`
      );
      return res.json(rows.map(r => ({ ...r, roles: r.roles || [] })));
    }

    // Collect user IDs this user is allowed to see
    const visibleIds = new Set();
    visibleIds.add(req.user.id); // Always see yourself

    // Line managers see their hierarchy
    if (roles.includes('line_manager')) {
      const managed = await getManagedUserIds(req.user.id);
      managed.forEach(id => visibleIds.add(id));
    }

    // Facility owners/admins see users with applications to their facilities
    if (roles.includes('facility_owner') || roles.includes('facility_admin')) {
      const { rows: facUsers } = await pool.query(
        `SELECT DISTINCT a.applicant_id FROM applications a
         WHERE a.facility_id IN (
           SELECT id FROM facilities WHERE owner_id = $1
           UNION
           SELECT facility_id FROM facility_admins WHERE user_id = $1
         )`,
        [req.user.id]
      );
      facUsers.forEach(r => visibleIds.add(r.applicant_id));
    }

    if (visibleIds.size === 0) {
      return res.json([]);
    }

    const { rows } = await pool.query(
      `${USER_SELECT} WHERE u.id = ANY($1) GROUP BY u.id ORDER BY u.full_name`,
      [[...visibleIds]]
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
    // Users can always see themselves
    if (req.user.id !== targetId && !req.user.roles.includes('administrator')) {
      // Check if line manager
      if (req.user.roles.includes('line_manager')) {
        const managed = await getManagedUserIds(req.user.id);
        if (!managed.includes(targetId)) {
          return res.status(403).json({ error: 'Otillräckliga rättigheter' });
        }
      } else {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
    }
    const { rows } = await pool.query(
      `${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...user } = rows[0];
    res.json({ ...user, roles: user.roles || [] });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST, PUT, DELETE require administrator
router.post('/', requireRole('administrator'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id } = req.body;

    // Input validation
    if (!email || typeof email !== 'string' || email.length > 255) return res.status(400).json({ error: 'Ogiltig e-postadress' });
    if (!full_name || typeof full_name !== 'string' || full_name.length > 255) return res.status(400).json({ error: 'Namn krävs (max 255 tecken)' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ogiltig e-postadress' });
    const policy = await getPasswordPolicy();
    const policyErr = validatePassword(password, policy);
    if (policyErr) { await client.query('ROLLBACK'); return res.status(400).json({ error: policyErr }); }


    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (email, full_name, first_name, last_name, password_hash, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) RETURNING *`,
      [email, full_name, (first_name || '').slice(0, 128), (last_name || '').slice(0, 128), hash, (department || '').slice(0, 100), (title || '').slice(0, 255), (phone || '').slice(0, 50), manager_id || null, contact_person_id || null, (company || '').slice(0, 255), is_active ?? true, org_unit_id || null]
    );
    const user = rows[0];
    if (roles?.length) {
      for (const role of roles) {
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.id, role]);
      }
    }
    await client.query('COMMIT');
    const { password_hash, ...pub } = user;
    await audit({ req, action: 'user_created', targetId: user.id, targetType: 'user', details: `E-post: ${email}, roller: ${(roles || []).join(',')}` });
    if (isEmailEnabled()) {
      // Issue a one-shot reset token so the new user sets their own password
      // instead of receiving the admin-typed one in cleartext.
      try {
        const { createHash, randomBytes } = await import('crypto');
        const raw = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(raw).digest('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h for onboarding
        await pool.query(
          'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
          [user.id, tokenHash, expires]
        );
        const link = `${process.env.APP_BASE_URL || ''}/reset-password?token=${raw}`;
        sendMail({
          to: email,
          subject: 'Välkommen till Access Guardian',
          title: 'Ditt konto har skapats',
          body: `<p>Hej ${full_name},</p><p>Ett konto har skapats åt dig. Klicka på knappen nedan för att välja ditt lösenord. Länken gäller i 24 timmar.</p>`,
          ctaLabel: 'Välj lösenord',
          ctaUrl: link,
        }).catch(() => {});
      } catch (err) {
        console.warn('[users] welcome email setup failed:', err.message);
      }
    }
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

router.put('/:id', requireRole('administrator'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = req.params.id;
    const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id } = req.body;

    const updates = [];
    const vals = [];
    let idx = 1;
    const addField = (name, val) => { if (val !== undefined) { updates.push(`${name} = $${idx++}`); vals.push(val); } };

    if (email !== undefined) {
      if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ogiltig e-postadress' });
      }
    }

    addField('email', email);
    addField('full_name', full_name ? full_name.slice(0, 255) : full_name);
    addField('first_name', first_name !== undefined ? (first_name || '').slice(0, 128) : undefined);
    addField('last_name', last_name !== undefined ? (last_name || '').slice(0, 128) : undefined);
    addField('department', department !== undefined ? (department || '').slice(0, 100) : undefined);
    addField('title', title !== undefined ? (title || '').slice(0, 255) : undefined);
    addField('phone', phone !== undefined ? (phone || '').slice(0, 50) : undefined);
    addField('manager_id', manager_id || null);
    addField('contact_person_id', contact_person_id || null);
    addField('company', company !== undefined ? (company || '').slice(0, 255) : undefined);
    addField('is_active', is_active);
    if (org_unit_id !== undefined) addField('org_unit_id', org_unit_id || null);

    if (password) {
      const policy = await getPasswordPolicy();
      const policyErr = validatePassword(password, policy);
      if (policyErr) { await client.query('ROLLBACK'); return res.status(400).json({ error: policyErr }); }
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
      `${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...pub } = rows[0];
    const changed = [];
    if (roles !== undefined) changed.push(`roller=${(roles || []).join(',')}`);
    if (is_active !== undefined) changed.push(`aktiv=${is_active}`);
    if (password) changed.push('lösenord');
    await audit({ req, action: 'user_updated', targetId, targetType: 'user', details: changed.join('; ') || 'profiluppdatering' });
    res.json({ ...pub, roles: pub.roles || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('administrator'), async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(403).json({ error: 'Du kan inte ta bort ditt eget konto' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    await audit({ req, action: 'user_deleted', targetId, targetType: 'user' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
