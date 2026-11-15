import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}


export function signToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// Routes a user may call while a password change is pending.
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/change-password', '/api/auth/me']);

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Ingen token angiven' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);

    // Always load fresh state from the database: deactivated users, revoked
    // roles and tokens issued before a password change must stop working.
    const { rows } = await pool.query(
      `SELECT u.is_active, u.must_change_password, u.password_changed_at,
              COALESCE(array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}'::text[]) AS roles
         FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
        WHERE u.id = $1 GROUP BY u.id`,
      [decoded.id]
    );
    const u = rows[0];
    if (!u || !u.is_active) {
      return res.status(401).json({ error: 'Kontot är inaktiverat' });
    }
    if (u.password_changed_at && decoded.iat * 1000 < new Date(u.password_changed_at).getTime() - 1000) {
      return res.status(401).json({ error: 'Sessionen har upphört, logga in igen' });
    }
    const path = (req.originalUrl || '').split('?')[0];
    if (u.must_change_password && !PASSWORD_CHANGE_ALLOWED.has(path)) {
      return res.status(403).json({ error: 'Du måste byta lösenord innan du fortsätter' });
    }
    const roles = u.roles;

    req.user = {
      id: decoded.id,
      email: decoded.email,
      roles,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Ogiltig eller utgången token' });
  }
}
