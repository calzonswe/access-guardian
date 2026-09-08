// Expands a list of area IDs to include all their ancestor areas.
// Access to a sub-area always requires access to every area above it.
export async function expandAreaAncestors(client, areaIds) {
  if (!Array.isArray(areaIds) || areaIds.length === 0) return [];
  const { rows } = await client.query(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_id FROM areas WHERE id = ANY($1::uuid[])
       UNION
       SELECT a.id, a.parent_id FROM areas a JOIN chain c ON a.id = c.parent_id
     )
     SELECT DISTINCT id FROM chain`,
    [areaIds]
  );
  return rows.map(r => r.id);
}
