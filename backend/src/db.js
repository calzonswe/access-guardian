import pg from 'pg';
import bcrypt from 'bcryptjs';

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

export async function initDb() {
  // Check if admin user exists
  const { rows } = await pool.query("SELECT id FROM users WHERE email = 'admin@foretag.se'");
  if (rows.length === 0) {
    const hash = await bcrypt.hash('Admin123!', 12);
    const res = await pool.query(
      `INSERT INTO users (id, email, full_name, first_name, last_name, password_hash, department, is_active, must_change_password)
       VALUES (gen_random_uuid(), 'admin@foretag.se', 'Systemadministratör', 'System', 'Administratör', $1, 'IT', true, true)
       RETURNING id`,
      [hash]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'administrator')`,
      [res.rows[0].id]
    );
    console.log('Default admin user created');
  }
}
