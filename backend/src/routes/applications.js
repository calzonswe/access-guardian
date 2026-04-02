import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
              COALESCE(
                json_agg(json_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
                FILTER (WHERE att.id IS NOT NULL), '[]'
              ) AS attachments
       FROM applications a
       LEFT JOIN application_areas aa ON aa.application_id = a.id
       LEFT JOIN attachments att ON att.application_id = a.id
       GROUP BY a.id ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*,
              COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
              COALESCE(
                json_agg(json_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
                FILTER (WHERE att.id IS NOT NULL), '[]'
              ) AS attachments
       FROM applications a
       LEFT JOIN application_areas aa ON aa.application_id = a.id
       LEFT JOIN attachments att ON att.application_id = a.id
       WHERE a.id = $1 GROUP BY a.id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { applicant_id, facility_id, area_ids, status, start_date, end_date, has_exception, exception_justification } = req.body;
    const { rows } = await client.query(
      `INSERT INTO applications (applicant_id, facility_id, status, start_date, end_date, has_exception, exception_justification)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [applicant_id, facility_id, status || 'draft', start_date, end_date || null, has_exception ?? false, exception_justification]
    );
    const app = rows[0];
    if (area_ids?.length) {
      for (const areaId of area_ids) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [app.id, areaId]);
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ ...app, area_ids: area_ids || [], attachments: [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fields = ['status', 'start_date', 'end_date', 'has_exception', 'exception_justification',
      'manager_approved_at', 'manager_approved_by', 'facility_approved_at', 'facility_approved_by',
      'exception_approved_at', 'exception_approved_by', 'denied_reason'];
    const updates = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    }
    if (updates.length > 0) {
      vals.push(req.params.id);
      await client.query(`UPDATE applications SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
    }
    if (req.body.area_ids !== undefined) {
      await client.query('DELETE FROM application_areas WHERE application_id = $1', [req.params.id]);
      for (const areaId of req.body.area_ids) {
        await client.query('INSERT INTO application_areas (application_id, area_id) VALUES ($1,$2)', [req.params.id, areaId]);
      }
    }
    await client.query('COMMIT');
    // Return updated
    const { rows } = await client.query(
      `SELECT a.*,
              COALESCE(array_agg(aa.area_id) FILTER (WHERE aa.area_id IS NOT NULL), '{}') AS area_ids,
              COALESCE(
                json_agg(json_build_object('id', att.id, 'application_id', att.application_id, 'file_name', att.file_name, 'file_url', att.file_url, 'uploaded_at', att.uploaded_at))
                FILTER (WHERE att.id IS NOT NULL), '[]'
              ) AS attachments
       FROM applications a LEFT JOIN application_areas aa ON aa.application_id = a.id
       LEFT JOIN attachments att ON att.application_id = a.id
       WHERE a.id = $1 GROUP BY a.id`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM applications WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
