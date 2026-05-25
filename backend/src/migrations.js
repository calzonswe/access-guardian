// ============= Lightweight SQL migration runner =============
// Reads files from db/migrations/*.sql (sorted) and applies each one inside
// a transaction unless it's already recorded in schema_migrations.
// Idempotent; safe to run on every backend start.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// migrations live at <repo>/db/migrations (bind-mounted into the container)
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  || path.resolve(__dirname, '../../db/migrations');

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  let entries;
  try {
    entries = await fs.readdir(MIGRATIONS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[migrations] dir not found: ${MIGRATIONS_DIR} — skipping`);
      return;
    }
    throw err;
  }

  const files = entries.filter(f => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('[migrations] no .sql files found');
    return;
  }

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map(r => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(fullPath, 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`[migrations] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[migrations] FAILED ${file}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }
}
