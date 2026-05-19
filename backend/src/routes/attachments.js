import { Router } from 'express';
import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pool } from '../db.js';
import { getApplicationScope } from './applications.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
// Whitelist of permitted mime types for uploads
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

// Ensure upload directory exists at startup
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Could not create UPLOAD_DIR', UPLOAD_DIR, err);
});

function sanitizeFileName(name) {
  return String(name).replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

async function canAccessApp(req, applicationId) {
  const scope = await getApplicationScope(applicationId);
  if (!scope) return { ok: false, status: 404, error: 'Ansökan ej funnen' };
  const isAdmin = req.user.roles.includes('administrator');
  const isApplicant = scope.applicantId === req.user.id;
  const isManager = scope.managerId === req.user.id || scope.teamIds.has(req.user.id);
  const isSponsor = scope.contactPersonId === req.user.id;
  const isFacilityStaff = req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin');
  return { ok: true, scope, isAdmin, isApplicant, isManager, isSponsor, isFacilityStaff };
}

// Upload (JSON body with base64 file_data — kept for frontend compat)
router.post('/', async (req, res) => {
  try {
    const { application_id, file_name, file_data, mime_type } = req.body;
    if (!application_id) return res.status(400).json({ error: 'application_id krävs' });
    if (!file_name) return res.status(400).json({ error: 'file_name krävs' });
    if (!file_data) return res.status(400).json({ error: 'Ingen fildata angiven' });

    const access = await canAccessApp(req, application_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    const canModify = access.isAdmin || access.isApplicant;
    if (!canModify) return res.status(403).json({ error: 'Otillräckliga rättigheter' });

    // Decode base64 (strip data URL prefix if present)
    let b64 = file_data;
    let detectedMime = mime_type || 'application/octet-stream';
    const m = /^data:([^;]+);base64,(.*)$/s.exec(file_data);
    if (m) { detectedMime = m[1]; b64 = m[2]; }

    if (mime_type && !ALLOWED_MIME.has(detectedMime)) {
      return res.status(400).json({ error: 'Filtypen tillåts inte' });
    }

    let buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Ogiltig fildata' });
    }
    if (!buffer.length) return res.status(400).json({ error: 'Tom fil' });
    if (buffer.length > MAX_FILE_BYTES) {
      return res.status(400).json({ error: 'Filen är för stor (max 10 MB)' });
    }

    const safeName = sanitizeFileName(file_name);
    const storedName = `${randomUUID()}_${safeName}`;
    const fullPath = path.join(UPLOAD_DIR, storedName);
    await fs.writeFile(fullPath, buffer, { mode: 0o640 });

    // Insert row; file_url stores the API download endpoint so the frontend
    // can render it as a link (auth header is added by the api client).
    const { rows } = await pool.query(
      `INSERT INTO attachments (application_id, file_name, file_url)
       VALUES ($1, $2, $3) RETURNING id, application_id, file_name, file_url, uploaded_at`,
      [application_id, safeName, `fs:${storedName}`]
    );
    const row = rows[0];
    res.status(201).json({
      ...row,
      file_url: `/api/attachments/${row.id}/download`,
    });
  } catch (err) {
    console.error('attachment upload error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// Stream the file content
router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, application_id, file_name, file_url FROM attachments WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Bilaga ej funnen' });
    const att = rows[0];

    const access = await canAccessApp(req, att.application_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!(access.isAdmin || access.isApplicant || access.isManager || access.isSponsor || access.isFacilityStaff)) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }

    // Legacy data: URL stored directly in file_url -> redirect to it
    if (att.file_url.startsWith('data:')) {
      // Parse and stream the inline data so headers are correct
      const m = /^data:([^;]+);base64,(.*)$/s.exec(att.file_url);
      if (!m) return res.status(500).json({ error: 'Skadad bilagepost' });
      const buf = Buffer.from(m[2], 'base64');
      res.setHeader('Content-Type', m[1] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`);
      return res.end(buf);
    }

    if (!att.file_url.startsWith('fs:')) {
      return res.status(500).json({ error: 'Okänd lagringstyp' });
    }
    const storedName = att.file_url.slice(3);
    // Prevent path traversal: stored names are UUID-prefixed with no separators
    if (storedName.includes('/') || storedName.includes('..') || storedName.includes('\\')) {
      return res.status(400).json({ error: 'Ogiltig sökväg' });
    }
    const fullPath = path.join(UPLOAD_DIR, storedName);
    if (!existsSync(fullPath)) return res.status(404).json({ error: 'Filen saknas på disk' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`);
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('attachment download error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows: attRows } = await pool.query(
      'SELECT application_id, file_url FROM attachments WHERE id = $1',
      [req.params.id]
    );
    if (attRows.length === 0) return res.status(404).json({ error: 'Bilaga ej funnen' });
    const access = await canAccessApp(req, attRows[0].application_id);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!(access.isAdmin || access.isApplicant)) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }

    // Delete file from disk if applicable
    const url = attRows[0].file_url;
    if (url && url.startsWith('fs:')) {
      const storedName = url.slice(3);
      if (!storedName.includes('/') && !storedName.includes('..')) {
        const fullPath = path.join(UPLOAD_DIR, storedName);
        await fs.unlink(fullPath).catch(() => { /* ignore */ });
      }
    }
    await pool.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('attachment delete error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
