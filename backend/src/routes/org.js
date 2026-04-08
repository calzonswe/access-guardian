import { Router } from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(requireRole('administrator'));

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM organization_positions ORDER BY sort_order');
    // Build tree from flat list
    const tree = buildTree(rows);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.put('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM organization_positions');
    const nodes = req.body;
    await insertNodes(client, nodes, null);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

async function insertNodes(client, nodes, parentId, sortStart = 0) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const { rows } = await client.query(
      `INSERT INTO organization_positions (id, title, department, parent_id, user_id, sort_order)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6) RETURNING id`,
      [n.id || null, n.title, n.department || null, parentId, n.userId || null, sortStart + i]
    );
    if (n.children?.length) {
      await insertNodes(client, n.children, rows[0].id, 0);
    }
  }
}

function buildTree(rows) {
  const map = {};
  rows.forEach(r => {
    map[r.id] = {
      id: r.id,
      title: r.title,
      department: r.department,
      userId: r.user_id,
      children: [],
    };
  });
  const roots = [];
  rows.forEach(r => {
    if (r.parent_id && map[r.parent_id]) {
      map[r.parent_id].children.push(map[r.id]);
    } else {
      roots.push(map[r.id]);
    }
  });
  return roots;
}

export default router;
