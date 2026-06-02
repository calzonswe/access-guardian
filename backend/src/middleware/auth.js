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

export async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Ingen token angiven' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);

    // Always load fresh roles from the database
    const { rows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [decoded.id]
    );
    const roles = rows.map(r => r.role);

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
