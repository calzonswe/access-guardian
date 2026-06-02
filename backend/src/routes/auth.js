import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { pool } from '../db.js';
import { signToken, authMiddleware } from '../middleware/auth.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { audit } from '../services/audit.js';
import { sendMail, isEmailEnabled } from '../services/email.js';
import { getSecuritySettings } from '../services/settings.js';
import { checkLock, recordFailure, recordSuccess } from '../services/loginAttempts.js';

const router = Router();

const RESET_TOKEN_TTL_MIN = 60;
const APP_BASE_URL = process.env.APP_BASE_URL || '';

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-post och lösenord krävs' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Ogiltig e-postadress' });
    }

    // Per-email persistent lockout
    const lock = await checkLock(email);
    if (lock.locked) {
      const mins = Math.ceil(lock.remainingSeconds / 60);
      return res.status(429).json({ error: `Kontot är tillfälligt låst pga för många misslyckade försök. Försök igen om ${mins} minut(er).` });
    }

    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true
       GROUP BY u.id`,
      [email]
    );
    if (rows.length === 0) {
      await recordFailure(email);
      await audit({ action: 'login_failed', targetType: 'user', details: `E-post: ${String(email).slice(0,128)}, IP: ${ip}` });
      return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });
    }

    const user = rows[0];
    let roles = [];
    if (Array.isArray(user.roles)) {
      roles = user.roles;
    } else if (typeof user.roles === 'string' && user.roles.startsWith('{')) {
      roles = user.roles.slice(1, -1).split(',').map(r => r.trim()).filter(Boolean);
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const result = await recordFailure(email);
      await audit({ action: 'login_failed', actorId: user.id, targetId: user.id, targetType: 'user', details: `IP: ${ip}` });
      if (result.locked) {
        return res.status(429).json({ error: `Kontot är låst i ${result.lockoutMinutes} minut(er) pga för många misslyckade försök.` });
      }
      return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });
    }

    await recordSuccess(email);
    const { sessionTimeoutMinutes } = await getSecuritySettings();
    const token = signToken(
      { id: user.id, email: user.email, roles: roles.filter(Boolean) },
      `${sessionTimeoutMinutes}m`
    );
    await audit({ action: 'login_success', actorId: user.id, targetId: user.id, targetType: 'user', details: `IP: ${ip}` });
    res.json({
      token,
      user: mapUser(user),
      mustChangePassword: user.must_change_password,
      sessionTimeoutMinutes,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Lösenordet måste innehålla stora och små bokstäver, siffror och specialtecken' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, req.user.id]
    );
    await audit({ req, action: 'password_changed', targetId: req.user.id, targetType: 'user' });
    // Return updated user
    const { rows } = await pool.query(
      `SELECT u.*, array_agg(ur.role) AS roles FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [req.user.id]
    );
    const { sessionTimeoutMinutes } = await getSecuritySettings();
    const token = signToken(
      { id: rows[0].id, email: rows[0].email, roles: rows[0].roles.filter(Boolean) },
      `${sessionTimeoutMinutes}m`
    );
    res.json({ token, user: mapUser(rows[0]), mustChangePassword: false, sessionTimeoutMinutes });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ---------- Forgot password ----------
// Generic response to avoid user enumeration.
const forgotLimiter = createRateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.json({ success: true });
    }
    const { rows } = await pool.query(
      'SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );
    if (rows.length === 0) {
      return res.json({ success: true });
    }
    const user = rows[0];
    const raw = randomBytes(32).toString('hex');
    const tokenHash = hashToken(raw);
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
    // Invalidate old unused tokens for this user
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
      [user.id, tokenHash, expires]
    );
    await audit({ action: 'password_reset_requested', actorId: user.id, targetId: user.id, targetType: 'user' });

    if (isEmailEnabled()) {
      const link = `${APP_BASE_URL}/reset-password?token=${raw}`;
      sendMail({
        to: user.email,
        subject: 'Återställ ditt lösenord',
        title: 'Återställ ditt lösenord',
        body: `<p>Hej ${user.full_name || ''},</p><p>Klicka på knappen nedan för att välja ett nytt lösenord. Länken gäller i ${RESET_TOKEN_TTL_MIN} minuter.</p><p>Om du inte begärt återställning kan du ignorera detta meddelande.</p>`,
        ctaLabel: 'Återställ lösenord',
        ctaUrl: link,
      }).catch(() => {});
    } else {
      // Helpful for on-prem installs without SMTP
      console.log(`[auth] password reset token for ${user.email}: ${raw} (valid ${RESET_TOKEN_TTL_MIN}m)`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.json({ success: true }); // never leak
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token saknas' });
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Lösenordet måste vara minst 8 tecken' });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Lösenordet måste innehålla stora och små bokstäver, siffror och specialtecken' });
    }
    const tokenHash = hashToken(token);
    const { rows } = await pool.query(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Ogiltig eller använd länk' });
    const t = rows[0];
    if (t.used_at) return res.status(400).json({ error: 'Länken har redan använts' });
    if (new Date(t.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Länken har gått ut' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, t.user_id]
    );
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
      [t.id]
    );
    await audit({ action: 'password_reset_completed', actorId: t.user_id, targetId: t.user_id, targetType: 'user' });
    res.json({ success: true });
  } catch (err) {
    console.error('reset-password error:', err);
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
    const { sessionTimeoutMinutes } = await getSecuritySettings();
    res.json({ user: mapUser(rows[0]), mustChangePassword: rows[0].must_change_password, sessionTimeoutMinutes });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

function mapUser(row) {
  let roles = [];
  if (Array.isArray(row.roles)) {
    roles = row.roles;
  } else if (typeof row.roles === 'string' && row.roles.startsWith('{')) {
    roles = row.roles.slice(1, -1).split(',').map(r => r.trim()).filter(Boolean);
  }
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    roles: roles,
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
