import { Router } from 'express';
import { pool } from '../db.js';
import { getApplicationScope } from './applications.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { application_id, file_name, file_data } = req.body;
    if (!application_id) return res.status(400).json({ error: 'application_id krävs' });
    if (!file_name) return res.status(400).json({ error: 'file_name krävs' });
    if (!file_data) return res.status(400).json({ error: 'Ingen fildata angiven' });
    const scope = await getApplicationScope(application_id);
    if (!scope) return res.status(404).json({ error: 'Ansökan ej funnen' });
    const canModify = req.user.roles.includes('administrator') || scope.applicantId === req.user.id;
    if (!canModify) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    if (file_data.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Filen är för stor (max 10 MB)' });
    }
    const fileUrl = file_data.startsWith('data:') ? file_data : `data:application/octet-stream;base64,${file_data}`;
    const { rows } = await pool.query(
      `INSERT INTO attachments (application_id, file_name, file_url)
       VALUES ($1, $2, $3) RETURNING id, application_id, file_name, file_url, uploaded_at`,
      [application_id, file_name, fileUrl]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows: attRows } = await pool.query(
      'SELECT application_id FROM attachments WHERE id = $1',
      [req.params.id]
    );
    if (attRows.length === 0) return res.status(404).json({ error: 'Bilaga ej funnen' });
    const scope = await getApplicationScope(attRows[0].application_id);
    if (!scope) return res.status(404).json({ error: 'Ansökan ej funnen' });
    const canModify = req.user.roles.includes('administrator') || scope.applicantId === req.user.id;
    if (!canModify) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    await pool.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
