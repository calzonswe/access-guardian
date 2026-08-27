import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';

const router = Router();

export const UNIT_TYPES = ['company', 'department', 'unit', 'group'];

// Allowed parent type for each unit type. null = may be a root node.
const ALLOWED_PARENTS = {
  company: [null],
  department: [null, 'company'],
  unit: ['department'],
  group: ['unit'],
};

const TYPE_LABELS = {
  company: 'Företag/VD',
  department: 'Avdelning',
  unit: 'Enhet',
  group: 'Grupp',
};

async function getUnit(id) {
  const { rows } = await pool.query('SELECT * FROM organization_units WHERE id = $1', [id]);
  return rows[0];
}

async function validatePlacement(type, parentId, selfId = null) {
  if (!UNIT_TYPES.includes(type)) return 'Ogiltig nivåtyp';
  let parentType = null;
  if (parentId) {
    if (parentId === selfId) return 'En enhet kan inte vara sin egen överordnade';
    const parent = await getUnit(parentId);
    if (!parent) return 'Överordnad enhet hittades inte';
    parentType = parent.type;
    if (selfId) {
      // prevent cycles: parent must not be a descendant of self
      const { rows } = await pool.query(
        `WITH RECURSIVE anc AS (
           SELECT id, parent_id FROM organization_units WHERE id = $1
           UNION ALL
           SELECT o.id, o.parent_id FROM organization_units o JOIN anc a ON o.id = a.parent_id
         ) SELECT 1 FROM anc WHERE id = $2`,
        [parentId, selfId]
      );
      if (rows.length > 0) return 'Cirkulär struktur är inte tillåten';
    }
  }
  if (!ALLOWED_PARENTS[type].includes(parentType)) {
    const expected = ALLOWED_PARENTS[type].filter(Boolean).map(t => TYPE_LABELS[t]);
    return expected.length
      ? `${TYPE_LABELS[type]} måste ligga under ${expected.join(' eller ')}`
      : `${TYPE_LABELS[type]} kan bara ligga på toppnivå`;
  }
  return null;
}

function buildTree(rows) {
  const map = {};
  rows.forEach(r => {
    map[r.id] = {
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description || undefined,
      managerId: r.manager_id || undefined,
      parentId: r.parent_id || undefined,
      children: [],
    };
  });
  const roots = [];
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) map[r.parent_id].children.push(map[r.id]);
    else roots.push(map[r.id]);
  });
  return roots;
}

// Everyone authenticated may read the org structure
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM organization_units ORDER BY sort_order, name');
    res.json(buildTree(rows));
  } catch (err) {
    console.error('org list error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.post('/', requireRole('administrator'), async (req, res) => {
  try {
    const { name, type, description, parent_id, manager_id, sort_order } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Namn krävs' });
    const err = await validatePlacement(type, parent_id || null);
    if (err) return res.status(400).json({ error: err });
    const { rows } = await pool.query(
      `INSERT INTO organization_units (name, type, description, parent_id, manager_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [String(name).trim().slice(0, 255), type, description || null, parent_id || null, manager_id || null, sort_order ?? 0]
    );
    await audit({ req, action: 'settings_changed', targetId: rows[0].id, targetType: 'organization_unit', details: `Org-enhet skapad: ${name} (${type})` });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('org create error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/:id', requireRole('administrator'), async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getUnit(id);
    if (!existing) return res.status(404).json({ error: 'Ej hittad' });
    const name = req.body.name ?? existing.name;
    const type = req.body.type ?? existing.type;
    const parentId = req.body.parent_id !== undefined ? (req.body.parent_id || null) : existing.parent_id;
    const err = await validatePlacement(type, parentId, id);
    if (err) return res.status(400).json({ error: err });
    // children must still be valid under the new type
    const { rows: children } = await pool.query('SELECT DISTINCT type FROM organization_units WHERE parent_id = $1', [id]);
    for (const c of children) {
      if (!ALLOWED_PARENTS[c.type]?.includes(type)) {
        return res.status(400).json({ error: `Underordnade ${TYPE_LABELS[c.type]?.toLowerCase()} tillåter inte nivån ${TYPE_LABELS[type]}` });
      }
    }
    const { rows } = await pool.query(
      `UPDATE organization_units
       SET name=$1, type=$2, description=$3, parent_id=$4, manager_id=$5, sort_order=$6
       WHERE id=$7 RETURNING *`,
      [
        String(name).trim().slice(0, 255),
        type,
        req.body.description !== undefined ? (req.body.description || null) : existing.description,
        parentId,
        req.body.manager_id !== undefined ? (req.body.manager_id || null) : existing.manager_id,
        req.body.sort_order ?? existing.sort_order,
        id,
      ]
    );
    await audit({ req, action: 'settings_changed', targetId: id, targetType: 'organization_unit', details: `Org-enhet uppdaterad: ${name}` });
    res.json(rows[0]);
  } catch (err) {
    console.error('org update error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', requireRole('administrator'), async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getUnit(id);
    if (!existing) return res.status(404).json({ error: 'Ej hittad' });
    await pool.query('DELETE FROM organization_units WHERE id = $1', [id]);
    await audit({ req, action: 'settings_changed', targetId: id, targetType: 'organization_unit', details: `Org-enhet borttagen: ${existing.name}` });
    res.json({ success: true });
  } catch (err) {
    console.error('org delete error:', err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

/**
 * Nearest manager for a user through the organization tree.
 * Used as fallback approver when the user has no explicit manager_id.
 */
export async function getOrgManagerForUser(userId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE chain AS (
       SELECT o.id, o.parent_id, o.manager_id, 0 AS depth
       FROM organization_units o
       JOIN users u ON u.org_unit_id = o.id
       WHERE u.id = $1
       UNION ALL
       SELECT p.id, p.parent_id, p.manager_id, c.depth + 1
       FROM organization_units p JOIN chain c ON p.id = c.parent_id
     )
     SELECT manager_id FROM chain
     WHERE manager_id IS NOT NULL AND manager_id <> $1
     ORDER BY depth LIMIT 1`,
    [userId]
  );
  return rows[0]?.manager_id || null;
}

export default router;
