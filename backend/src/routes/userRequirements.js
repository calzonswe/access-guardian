import { Router } from 'express';
import { promises as fs, createReadStream, existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { pool } from '../db.js';
import { getManagedUserIds } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Could not create UPLOAD_DIR', UPLOAD_DIR, err);
});

function sanitizeFileName(name) {
  return String(name).replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

// Can the current request modify/upload to a user_requirement owned by `ownerId`?
async function canModifyOwner(req, ownerId) {
  if (!req.user) return false;
  if (req.user.id === ownerId) return true;
  if (req.user.roles.includes('administrator')) return true;
  if (req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) return true;
  if (req.user.roles.includes('line_manager')) {
    const managed = await getManagedUserIds(req.user.id);
    return managed.includes(ownerId);
  }
  return false;
}

router.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (req.user.roles.includes('administrator')) {
      let query = 'SELECT * FROM user_requirements';
      const params = [];
      if (userId) { query += ' WHERE user_id = $1'; params.push(userId); }
      query += ' ORDER BY fulfilled_at DESC';
      const { rows } = await pool.query(query, params);
      return res.json(rows);
    }
    if (req.user.roles.includes('line_manager') || req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin')) {
      const managed = await getManagedUserIds(req.user.id);
      const targetUserId = userId || req.user.id;
      if (targetUserId !== req.user.id && !managed.includes(targetUserId) && !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
      const { rows } = await pool.query(
        'SELECT * FROM user_requirements WHERE user_id = $1 ORDER BY fulfilled_at DESC',
        [targetUserId]
      );
      return res.json(rows);
    }
    const targetUserId = userId || req.user.id;
    if (targetUserId !== req.user.id) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    const { rows } = await pool.query(
      'SELECT * FROM user_requirements WHERE user_id = $1 ORDER BY fulfilled_at DESC',
      [targetUserId]
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') &&
        !req.user.roles.includes('facility_admin') &&
        !req.user.roles.includes('line_manager')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    let { user_id, requirement_id, fulfilled_at, expires_at, certified_by, status, attachment_name } = req.body;
    if (user_id !== req.user.id && !req.user.roles.includes('administrator') &&
        !req.user.roles.includes('facility_owner') && !req.user.roles.includes('facility_admin')) {
      const managed = await getManagedUserIds(req.user.id);
      if (!managed.includes(user_id)) {
        return res.status(403).json({ error: 'Kan endast lägga till krav för egna eller underställda' });
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO user_requirements (user_id, requirement_id, fulfilled_at, expires_at, certified_by, status, attachment_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user_id, requirement_id, fulfilled_at || new Date().toISOString(), expires_at || null, certified_by || null, status || 'fulfilled', attachment_name || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM user_requirements WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!(await canModifyOwner(req, existing[0].user_id))) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { fulfilled_at, expires_at, status, attachment_name } = req.body;
    const updates = [];
    const vals = [];
    let idx = 1;
    if (fulfilled_at !== undefined) { updates.push(`fulfilled_at = $${idx++}`); vals.push(fulfilled_at); }
    if (expires_at !== undefined) { updates.push(`expires_at = $${idx++}`); vals.push(expires_at); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); vals.push(status); }
    if (attachment_name !== undefined) { updates.push(`attachment_name = $${idx++}`); vals.push(attachment_name); }
    if (updates.length === 0) return res.status(400).json({ error: 'Inga fält att uppdatera' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE user_requirements SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      'SELECT user_id, attachment_storage_key FROM user_requirements WHERE id = $1',
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!(await canModifyOwner(req, existing[0].user_id))) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    // Clean up file on disk
    const key = existing[0].attachment_storage_key;
    if (key && !key.includes('/') && !key.includes('..')) {
      await fs.unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
    }
    await pool.query('DELETE FROM user_requirements WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ---------- Attachment endpoints (multipart, disk-backed) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

router.post('/:id/attachment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ingen fil bifogad' });
    const { rows: existing } = await pool.query(
      'SELECT user_id, attachment_storage_key FROM user_requirements WHERE id = $1',
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!(await canModifyOwner(req, existing[0].user_id))) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const mime = req.file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) return res.status(400).json({ error: 'Filtypen tillåts inte' });

    const safeName = sanitizeFileName(req.file.originalname || 'file');
    const storedName = `ur_${randomUUID()}_${safeName}`;
    await fs.writeFile(path.join(UPLOAD_DIR, storedName), req.file.buffer, { mode: 0o640 });

    // Remove any previous file
    const oldKey = existing[0].attachment_storage_key;
    if (oldKey && !oldKey.includes('/') && !oldKey.includes('..')) {
      await fs.unlink(path.join(UPLOAD_DIR, oldKey)).catch(() => {});
    }

    const { rows } = await pool.query(
      `UPDATE user_requirements
         SET attachment_name = $1, attachment_storage_key = $2,
             attachment_mime = $3, attachment_size_bytes = $4
       WHERE id = $5 RETURNING *`,
      [safeName, storedName, mime, req.file.buffer.length, req.params.id]
    );
    await audit({ req, action: 'attachment_uploaded', targetId: req.params.id, targetType: 'user_requirement', details: `Fil: ${safeName}` });
    res.json(rows[0]);
  } catch (err) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Filen är för stor (max 10 MB)' });
    }
    console.error('user-requirement attachment upload error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT user_id, attachment_name, attachment_storage_key, attachment_mime FROM user_requirements WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const ur = rows[0];
    // Read access: owner, manager-of-owner, admins, facility staff
    const isAdmin = req.user.roles.includes('administrator');
    const isFacilityStaff = req.user.roles.includes('facility_owner') || req.user.roles.includes('facility_admin');
    let allowed = ur.user_id === req.user.id || isAdmin || isFacilityStaff;
    if (!allowed && req.user.roles.includes('line_manager')) {
      const managed = await getManagedUserIds(req.user.id);
      allowed = managed.includes(ur.user_id);
    }
    if (!allowed) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    if (!ur.attachment_storage_key) return res.status(404).json({ error: 'Ingen bilaga' });
    const key = ur.attachment_storage_key;
    if (key.includes('/') || key.includes('..')) return res.status(400).json({ error: 'Ogiltig sökväg' });
    const fullPath = path.join(UPLOAD_DIR, key);
    if (!existsSync(fullPath)) return res.status(404).json({ error: 'Filen saknas på disk' });
    res.setHeader('Content-Type', ur.attachment_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(ur.attachment_name || 'file')}"`);
    createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error('user-requirement attachment download error', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id/attachment', async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      'SELECT user_id, attachment_storage_key FROM user_requirements WHERE id = $1',
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    if (!(await canModifyOwner(req, existing[0].user_id))) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const key = existing[0].attachment_storage_key;
    if (key && !key.includes('/') && !key.includes('..')) {
      await fs.unlink(path.join(UPLOAD_DIR, key)).catch(() => {});
    }
    await pool.query(
      `UPDATE user_requirements
         SET attachment_name = NULL, attachment_storage_key = NULL,
             attachment_mime = NULL, attachment_size_bytes = NULL
       WHERE id = $1`,
      [req.params.id]
    );
    await audit({ req, action: 'attachment_deleted', targetId: req.params.id, targetType: 'user_requirement' });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
