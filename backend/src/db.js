import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings. By default pg turns
// them into JS Dates at midnight, which serialize as '...T00:00:00.000Z' and
// can shift a day depending on the server's time zone.
pg.types.setTypeParser(1082, (value) => value);

if (!process.env.DB_PASSWORD) {
  console.error('FATAL: DB_PASSWORD environment variable is not set');
  process.exit(1);
}

export const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'rbac_access',
  user: process.env.DB_USER || 'rbac_user',
  password: process.env.DB_PASSWORD,
});

function generateInitialPassword() {
  // 16-char password meeting the policy (U/L/digit/symbol)
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const b = randomBytes(16);
  const out = [
    upper[b[0] % upper.length],
    lower[b[1] % lower.length],
    digits[b[2] % digits.length],
    symbols[b[3] % symbols.length],
  ];
  for (let i = 4; i < 16; i++) out.push(all[b[i] % all.length]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

export async function initDb() {
  // Read initial admin credentials from env, with safe fallbacks.
  const email = (process.env.INITIAL_ADMIN_EMAIL || 'admin@foretag.se').toLowerCase();

  // Seed only when the system has no administrator at all. Checking the
  // e-mail address instead would create a new admin on every restart once
  // the original admin changed address or was removed.
  const { rows: admins } = await pool.query(`SELECT 1 FROM user_roles WHERE role = 'administrator' LIMIT 1`);
  if (admins.length > 0) return;
  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
  if (rows.length > 0) {
    console.warn(`[initDb] No administrator exists, but ${email} is already a user; grant the role manually.`);
    return;
  }

  let password = process.env.INITIAL_ADMIN_PASSWORD;
  let generated = false;
  if (!password) {
    password = generateInitialPassword();
    generated = true;
  }

  const hash = await bcrypt.hash(password, 12);
  const res = await pool.query(
    `INSERT INTO users (id, email, full_name, first_name, last_name, password_hash, department, is_active, must_change_password)
     VALUES (gen_random_uuid(), $1, 'Systemadministratör', 'System', 'Administratör', $2, 'IT', true, true)
     RETURNING id`,
    [email, hash]
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'administrator')`,
    [res.rows[0].id]
  );

  if (generated) {
    console.log('================================================================');
    console.log('  INITIAL ADMIN CREATED');
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log('  Change it at first login. This will not be shown again.');
    console.log('================================================================');
  } else {
    console.log(`Initial admin created (${email}) — password from INITIAL_ADMIN_PASSWORD env`);
  }
}
