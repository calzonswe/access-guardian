import { Router } from 'express';
import { pool } from '../db.js';
import { audit } from '../services/audit.js';

const router = Router();

// A requirement with an expiry must say how long it is valid.
function validityError(has_expiry, validity_days) {
  if (!has_expiry) return null;
  const n = Number(validity_days);
  return Number.isInteger(n) && n > 0 ? null : 'Ange giltighetstid i dagar (minst 1) när kravet har giltighetstid';
}


router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM requirements ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', async (req, res) => {
  try {
    // The requirement catalogue is global: only system administrators may change it.
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Endast systemadministratör kan ändra kravkatalogen' });
    }
    const { name, description, type, has_expiry, validity_days } = req.body;
    const vErr = validityError(has_expiry, validity_days);
    if (vErr) return res.status(400).json({ error: vErr });
    const { rows } = await pool.query(
      'INSERT INTO requirements (name, description, type, has_expiry, validity_days) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, description, type, has_expiry ?? false, has_expiry ? Number(validity_days) : null]
    );
    await audit({ req, action: 'requirement_created', targetId: rows[0].id, targetType: 'requirement', details: `Namn: ${name}` });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    // The requirement catalogue is global: only system administrators may change it.
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Endast systemadministratör kan ändra kravkatalogen' });
    }
    const { name, description, type, has_expiry, validity_days } = req.body;
    const vErr = validityError(has_expiry, validity_days);
    if (vErr) return res.status(400).json({ error: vErr });
    const { rows } = await pool.query(
      'UPDATE requirements SET name=$1, description=$2, type=$3, has_expiry=$4, validity_days=$5 WHERE id=$6 RETURNING *',
      [name, description, type, has_expiry, has_expiry ? Number(validity_days) : null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    await audit({ req, action: 'requirement_updated', targetId: req.params.id, targetType: 'requirement', details: `Namn: ${name}` });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!req.user.roles.includes('administrator')) {
      return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    await pool.query('DELETE FROM requirements WHERE id = $1', [req.params.id]);
    await audit({ req, action: 'requirement_deleted', targetId: req.params.id, targetType: 'requirement' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
