// ============= Public Contractor Application Flow =============
// Public (un-authenticated) endpoints used by the external contractor form.
// All routes here are aggressively rate-limited at the mount point.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID, randomBytes } from 'crypto';
import { pool } from '../db.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 8;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

function sanitizeFileName(name) {
  return String(name).replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}
function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 255;
}
function generateTempPassword() {
  // 12 chars: ensure upper, lower, digit and symbol so it passes change-password rules
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const buf = randomBytes(12);
  const out = [upper[buf[0] % upper.length], lower[buf[1] % lower.length], digits[buf[2] % digits.length], symbols[buf[3] % symbols.length]];
  for (let i = 4; i < 12; i++) out.push(all[buf[i] % all.length]);
  // shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

// GET /api/contractor/facilities — public list of facilities + areas for the form
router.get('/facilities', async (_req, res) => {
  try {
    const { rows: facilities } = await pool.query(
      `SELECT id, name, description, address FROM facilities ORDER BY name`
    );
    const { rows: areas } = await pool.query(
      `SELECT id, facility_id, name, description, security_level FROM areas ORDER BY name`
    );
    res.json({ facilities, areas });
  } catch (err) {
    console.error('contractor facilities error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/contractor/apply — submit a contractor application publicly
router.post('/apply', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      first_name, last_name, email, phone, company,
      sponsor_email, facility_id, area_ids, start_date, end_date,
      justification, attachments,
    } = req.body || {};

    // ---- Validation ----
    if (!first_name || !last_name || typeof first_name !== 'string' || typeof last_name !== 'string') {
      return res.status(400).json({ error: 'För- och efternamn krävs' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Ogiltig e-postadress' });
    if (!isValidEmail(sponsor_email)) return res.status(400).json({ error: 'Ogiltig sponsor-e-postadress' });
    if (!company || typeof company !== 'string') return res.status(400).json({ error: 'Företag krävs' });
    if (!facility_id) return res.status(400).json({ error: 'Anläggning krävs' });
    if (!start_date) return res.status(400).json({ error: 'Startdatum krävs' });
    if (!Array.isArray(area_ids)) return res.status(400).json({ error: 'Områden ogiltigt format' });
    if (attachments && !Array.isArray(attachments)) return res.status(400).json({ error: 'Bilagor ogiltigt format' });
    if (attachments && attachments.length > MAX_FILES) return res.status(400).json({ error: `Max ${MAX_FILES} bilagor` });

    // ---- Sponsor must exist and be active ----
    const { rows: sponsorRows } = await client.query(
      `SELECT id, full_name, email FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true`,
      [sponsor_email]
    );
    if (sponsorRows.length === 0) {
      return res.status(400).json({ error: 'Sponsor med angiven e-post hittades inte. Kontakta din kontaktperson.' });
    }
    const sponsor = sponsorRows[0];

    // ---- Facility / areas validity ----
    const { rows: facRows } = await client.query(`SELECT id FROM facilities WHERE id = $1`, [facility_id]);
    if (facRows.length === 0) return res.status(400).json({ error: 'Ogiltig anläggning' });
    if (area_ids.length > 0) {
      const { rows: validAreas } = await client.query(
        `SELECT id FROM areas WHERE facility_id = $1 AND id = ANY($2::uuid[])`,
        [facility_id, area_ids]
      );
      if (validAreas.length !== area_ids.length) {
        return res.status(400).json({ error: 'Ogiltigt område' });
      }
    }

    await client.query('BEGIN');

    // ---- Find or create contractor user ----
    const { rows: existing } = await client.query(
      `SELECT id, is_active FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    let contractorId;
    let tempPassword = null;
    if (existing.length > 0) {
      contractorId = existing[0].id;
      // Refresh sponsor link + company + phone
      await client.query(
        `UPDATE users SET contact_person_id = $1, company = $2, phone = COALESCE($3, phone), is_active = true WHERE id = $4`,
        [sponsor.id, String(company).slice(0, 255), phone ? String(phone).slice(0, 50) : null, contractorId]
      );
    } else {
      tempPassword = generateTempPassword();
      const hash = await bcrypt.hash(tempPassword, 12);
      const fullName = `${first_name} ${last_name}`.trim().slice(0, 255);
      const { rows: created } = await client.query(
        `INSERT INTO users (email, full_name, first_name, last_name, password_hash, phone, contact_person_id, company, is_active, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true) RETURNING id`,
        [email, fullName, String(first_name).slice(0, 128), String(last_name).slice(0, 128), hash,
         phone ? String(phone).slice(0, 50) : null, sponsor.id, String(company).slice(0, 255)]
      );
      contractorId = created[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'contractor') ON CONFLICT DO NOTHING`,
        [contractorId]
      );
    }

    // ---- Create application ----
    const hasException = !!(justification && String(justification).trim());
    const { rows: appRows } = await client.query(
      `INSERT INTO applications (applicant_id, facility_id, status, start_date, end_date, has_exception, exception_justification)
       VALUES ($1,$2,'pending_manager',$3,$4,$5,$6) RETURNING id`,
      [contractorId, facility_id, start_date, end_date || null, hasException, hasException ? String(justification).slice(0, 2000) : null]
    );
    const appId = appRows[0].id;
    for (const areaId of area_ids) {
      await client.query(
        `INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)`,
        [appId, areaId]
      );
    }

    // ---- Save attachments to disk ----
    for (const att of (attachments || [])) {
      if (!att || !att.file_name || !att.file_data) continue;
      let b64 = att.file_data;
      let mime = att.mime_type || 'application/octet-stream';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(att.file_data);
      if (m) { mime = m[1]; b64 = m[2]; }
      if (!ALLOWED_MIME.has(mime)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Filtypen tillåts inte: ${att.file_name}` });
      }
      let buffer;
      try { buffer = Buffer.from(b64, 'base64'); } catch {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ogiltig fildata' });
      }
      if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Filen är för stor: ${att.file_name}` });
      }
      const safeName = sanitizeFileName(att.file_name);
      const storedName = `${randomUUID()}_${safeName}`;
      await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer, { mode: 0o640 });
      await client.query(
        `INSERT INTO attachments (application_id, file_name, file_url) VALUES ($1,$2,$3)`,
        [appId, safeName, `fs:${storedName}`]
      );
    }

    // ---- Notify sponsor ----
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1,$2,$3,'action_required',$4)`,
      [sponsor.id,
       'Ny entreprenörsansökan att granska',
       `${first_name} ${last_name} (${company}) har skickat in en tillträdesansökan som väntar på ditt godkännande.`,
       `/applications`]
    );

    // ---- Audit log ----
    await client.query(
      `INSERT INTO system_logs (action, actor_id, target_id, target_type, details)
       VALUES ('application_created', $1, $2, 'application', $3)`,
      [contractorId, appId, `Entreprenörsansökan via publikt formulär. Sponsor: ${sponsor.email}`]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      application_id: appId,
      temp_password: tempPassword, // null if account already existed
      message: tempPassword
        ? 'Ansökan mottagen. Spara ditt tillfälliga lösenord – du behöver det för att logga in och följa ärendet.'
        : 'Ansökan mottagen. Använd dina befintliga inloggningsuppgifter för att följa ärendet.',
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('contractor apply error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

export default router;
