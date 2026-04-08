import { pool } from '../db.js';

const VALID_ROLES = ['administrator', 'facility_owner', 'facility_admin', 'line_manager', 'employee', 'contractor'];

function hasRole(userRoles, ...required) {
  if (!userRoles || !Array.isArray(userRoles)) return false;
  if (required.includes('any')) return true;
  return required.some(r => userRoles.includes(r));
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.roles) {
        return res.status(401).json({ error: 'Ej autentiserad' });
      }
      if (!hasRole(req.user.roles, ...roles)) {
        return res.status(403).json({ error: 'Otillräckliga rättigheter' });
      }
      next();
    } catch (err) {
      console.error('requireRole error:', err);
      res.status(500).json({ error: 'Internt serverfel' });
    }
  };
}

export async function getUserRoles(userId) {
  const { rows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );
  return rows.map(r => r.role);
}

export async function hasRoleAsync(userId, ...roles) {
  const userRoles = await getUserRoles(userId);
  return hasRole(userRoles, ...roles);
}

export async function isFacilityAdmin(userId, facilityId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM facility_admins WHERE user_id = $1 AND facility_id = $2 UNION ALL
     SELECT 1 FROM facilities WHERE owner_id = $1 AND id = $2`,
    [userId, facilityId]
  );
  return rows.length > 0;
}

export async function isFacilityAdminOrOwner(userId, facilityId) {
  if (!userId || !facilityId) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM facilities WHERE (owner_id = $1 OR id IN (SELECT facility_id FROM facility_admins WHERE user_id = $1)) AND id = $2`,
    [userId, facilityId]
  );
  return rows.length > 0;
}

export async function isManagerOf(userId, targetUserId) {
  if (userId === targetUserId) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND manager_id = $2',
    [targetUserId, userId]
  );
  return rows.length > 0;
}

export async function getManagedUserIds(managerId) {
  const { rows } = await pool.query(
    'WITH RECURSIVE team AS (SELECT id FROM users WHERE manager_id = $1 UNION ALL SELECT u.id FROM users u JOIN team t ON u.manager_id = t.id) SELECT id FROM team',
    [managerId]
  );
  return rows.map(r => r.id);
}

export async function getFacilityIdForArea(areaId) {
  const { rows } = await pool.query('SELECT facility_id FROM areas WHERE id = $1', [areaId]);
  return rows[0]?.facility_id;
}

export function requireFacilityAccess(getFacilityId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Ej autentiserad' });
      }
      const facilityId = typeof getFacilityId === 'function' ? getFacilityId(req) : req.params[getFacilityId] || req.query[getFacilityId] || req.body[getFacilityId];
      if (!facilityId) {
        return res.status(400).json({ error: 'facility_id krävs' });
      }
      if (hasRole(req.user.roles, 'administrator')) {
        return next();
      }
      if (hasRole(req.user.roles, 'facility_owner', 'facility_admin')) {
        const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
        if (hasAccess) return next();
      }
      return res.status(403).json({ error: 'Ingen åtkomst till denna anläggning' });
    } catch (err) {
      console.error('requireFacilityAccess error:', err);
      res.status(500).json({ error: 'Internt serverfel' });
    }
  };
}

export function requireAreaAccess(getAreaId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Ej autentiserad' });
      }
      const areaId = typeof getAreaId === 'function' ? getAreaId(req) : req.params[getAreaId] || req.query[getAreaId] || req.body[getAreaId];
      if (!areaId) {
        return res.status(400).json({ error: 'area_id krävs' });
      }
      if (hasRole(req.user.roles, 'administrator')) {
        return next();
      }
      if (hasRole(req.user.roles, 'facility_owner', 'facility_admin')) {
        const facilityId = await getFacilityIdForArea(areaId);
        if (facilityId) {
          const hasAccess = await isFacilityAdminOrOwner(req.user.id, facilityId);
          if (hasAccess) return next();
        }
      }
      return res.status(403).json({ error: 'Ingen åtkomst till detta område' });
    } catch (err) {
      console.error('requireAreaAccess error:', err);
      res.status(500).json({ error: 'Internt serverfel' });
    }
  };
}

export { VALID_ROLES };
