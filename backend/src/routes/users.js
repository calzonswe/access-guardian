import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { requireRole, getManagedUserIds, VALID_ROLES } from '../middleware/rbac.js';
import { audit } from '../services/audit.js';
import { sendMail, isEmailEnabled, htmlEscape } from '../services/email.js';
import { getPasswordPolicy, validatePassword } from '../services/settings.js';
import { getSubstitutedReportIds, validateSubstitute } from '../services/substitutes.js';
import { notifyUser } from '../services/notify.js';
import { validateImportRow, generateTempPassword } from '../services/userImport.js';

const router = Router();

const USER_SELECT = `SELECT u.id, u.email, u.full_name, u.first_name, u.last_name, u.department,
              u.title, u.phone, u.manager_id, u.contact_person_id, u.company, u.org_unit_id,
              u.is_active, u.created_at, u.substitute_id, u.substitute_from, u.substitute_to,
              array_agg(ur.role::text) FILTER (WHERE ur.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id`;

// Parse optional pagination params. Returns null when not requested (legacy array response).
function parsePaging(req) {
  if (req.query.page === undefined && req.query.limit === undefined) return null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Build optional search/role/status filters shared by count and data queries.
function buildUserFilters(req) {
  const conditions = [];
  const params = [];
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR COALESCE(u.company,'') ILIKE $${params.length})`);
  }
  if (req.query.role && req.query.role !== 'all') {
    params.push(req.query.role);
    conditions.push(`EXISTS (SELECT 1 FROM user_roles rf WHERE rf.user_id = u.id AND rf.role = $${params.length})`);
  }
  if (req.query.status === 'active') conditions.push('u.is_active = true');
  else if (req.query.status === 'inactive') conditions.push('u.is_active = false');
  return { conditions, params };
}

// GET /api/users — role-based filtering. With ?page/&limit/&search/&role/&status returns { data, total, page, pageSize }.
router.get('/', async (req, res) => {
  try {
    const roles = req.user.roles;
    const paging = parsePaging(req);

    // Admins see all users
    if (roles.includes('administrator')) {
      const { conditions, params } = buildUserFilters(req);
      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      if (!paging) {
        const { rows } = await pool.query(`${USER_SELECT}${where} GROUP BY u.id ORDER BY u.full_name`, params);
        return res.json(rows.map(r => ({ ...r, roles: r.roles || [] })));
      }
      const { rows: countRows } = await pool.query(`SELECT COUNT(DISTINCT u.id) AS n FROM users u${where}`, params);
      const total = parseInt(countRows[0].n, 10);
      const { rows } = await pool.query(
        `${USER_SELECT}${where} GROUP BY u.id ORDER BY u.full_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, paging.pageSize, paging.offset]
      );
      return res.json({ data: rows.map(r => ({ ...r, roles: r.roles || [] })), total, page: paging.page, pageSize: paging.pageSize });
    }

    // Collect user IDs this user is allowed to see
    const visibleIds = new Set();
    visibleIds.add(req.user.id); // Always see yourself

    // Line managers see their hierarchy
    if (roles.includes('line_manager')) {
      const managed = await getManagedUserIds(req.user.id);
      managed.forEach(id => visibleIds.add(id));
    }

    // Substitutes see the direct reports of the managers they stand in for
    (await getSubstitutedReportIds(pool, req.user.id)).forEach(id => visibleIds.add(id));

    // Sponsors (contact persons) see the contractors they sponsor
    const { rows: sponsored } = await pool.query('SELECT id FROM users WHERE contact_person_id = $1', [req.user.id]);
    sponsored.forEach(r => visibleIds.add(r.id));

    // Facility owners/admins see users with applications to their facilities
    if (roles.includes('facility_owner') || roles.includes('facility_admin')) {
      const { rows: facUsers } = await pool.query(
        `SELECT DISTINCT a.applicant_id FROM applications a
         WHERE a.facility_id IN (
           SELECT id FROM facilities WHERE owner_id = $1
           UNION
           SELECT facility_id FROM facility_admins WHERE user_id = $1
         )`,
        [req.user.id]
      );
      facUsers.forEach(r => visibleIds.add(r.applicant_id));
    }

    if (visibleIds.size === 0) {
      return res.json(paging ? { data: [], total: 0, page: paging.page, pageSize: paging.pageSize } : []);
    }

    const { conditions, params } = buildUserFilters(req);
    params.push([...visibleIds]);
    const scopeCond = `u.id = ANY($${params.length})`;
    const where = ` WHERE ${[scopeCond, ...conditions].join(' AND ')}`;
    if (!paging) {
      const { rows } = await pool.query(
        `${USER_SELECT}${where} GROUP BY u.id ORDER BY u.full_name`,
        params
      );
      return res.json(rows.map(r => ({ ...r, roles: r.roles || [] })));
    }
    const { rows: countRows } = await pool.query(`SELECT COUNT(DISTINCT u.id) AS n FROM users u${where}`, params);
    const total = parseInt(countRows[0].n, 10);
    const { rows } = await pool.query(
      `${USER_SELECT}${where} GROUP BY u.id ORDER BY u.full_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, paging.pageSize, paging.offset]
    );
    res.json({ data: rows.map(r => ({ ...r, roles: r.roles || [] })), total, page: paging.page, pageSize: paging.pageSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// Line managers that can be chosen as substitutes (id + name only).
router.get('/managers', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.full_name FROM users u JOIN user_roles r ON r.user_id = u.id
        WHERE u.is_active = true AND r.role = 'line_manager' ORDER BY u.full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    // Users can always see themselves
    if (req.user.id !== targetId && !req.user.roles.includes('administrator')) {
      const { rows: rel } = await pool.query(
        'SELECT 1 FROM users WHERE id = $1 AND contact_person_id = $2',
        [targetId, req.user.id]
      );
      let allowed = rel.length > 0 || (await getSubstitutedReportIds(pool, req.user.id)).includes(targetId);
      if (!allowed && req.user.roles.includes('line_manager')) {
        const managed = await getManagedUserIds(req.user.id);
        allowed = managed.includes(targetId);
      }
      if (!allowed) return res.status(403).json({ error: 'Otillräckliga rättigheter' });
    }
    const { rows } = await pool.query(
      `${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...user } = rows[0];
    res.json({ ...user, roles: user.roles || [] });
  } catch (err) {
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

/**
 * Guards against circular manager chains: the proposed manager must not be
 * the user themselves nor anywhere below them in the reporting tree.
 */
async function managerChainError(client, userId, managerId) {
  if (!managerId) return null;
  if (userId && managerId === userId) return 'En användare kan inte vara sin egen chef';
  if (!userId) return null;
  const { rows } = await client.query(
    `WITH RECURSIVE chain AS (
       SELECT id, manager_id FROM users WHERE id = $1
       UNION
       SELECT u.id, u.manager_id FROM users u JOIN chain c ON u.id = c.manager_id
     ) SELECT 1 FROM chain WHERE id = $2`,
    [managerId, userId]
  );
  return rows.length > 0 ? 'Cirkulär chefskedja är inte tillåten' : null;
}

function invalidRoles(roles) {
  if (roles === undefined) return null;
  if (!Array.isArray(roles)) return 'Roller ogiltigt format';
  const bad = roles.filter(r => !VALID_ROLES.includes(r));
  return bad.length ? `Ogiltig roll: ${bad.join(', ')}` : null;
}

// Would this change leave the system without an active administrator?
async function removesLastAdmin(client, targetId, { roles, is_active }) {
  const losesAdmin = (roles !== undefined && !roles.includes('administrator')) || is_active === false;
  if (!losesAdmin) return false;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM users u JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role = 'administrator' AND u.is_active = true AND u.id <> $1`,
    [targetId]
  );
  return rows[0].n === 0;
}

// POST, PUT, DELETE require administrator
router.post('/', requireRole('administrator'), async (req, res) => {

  const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id } = req.body || {};

  // Input validation (before taking a connection / opening a transaction)
  if (!email || typeof email !== 'string' || email.length > 255) return res.status(400).json({ error: 'Ogiltig e-postadress' });
  if (!full_name || typeof full_name !== 'string' || full_name.length > 255) return res.status(400).json({ error: 'Namn krävs (max 255 tecken)' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Ogiltig e-postadress' });
  const rolesErr = invalidRoles(roles);
  if (rolesErr) return res.status(400).json({ error: rolesErr });
  const policyErr = validatePassword(password, await getPasswordPolicy());
  if (policyErr) return res.status(400).json({ error: policyErr });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');


    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (email, full_name, first_name, last_name, password_hash, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) RETURNING *`,
      [email, full_name, (first_name || '').slice(0, 128), (last_name || '').slice(0, 128), hash, (department || '').slice(0, 100), (title || '').slice(0, 255), (phone || '').slice(0, 50), manager_id || null, contact_person_id || null, (company || '').slice(0, 255), is_active ?? true, org_unit_id || null]
    );
    const user = rows[0];
    if (roles?.length) {
      for (const role of roles) {
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [user.id, role]);
      }
    }
    await client.query('COMMIT');
    const { password_hash, ...pub } = user;
    await audit({ req, action: 'user_created', targetId: user.id, targetType: 'user', details: `E-post: ${email}, roller: ${(roles || []).join(',')}` });
    if (isEmailEnabled()) {
      // Issue a one-shot reset token so the new user sets their own password
      // instead of receiving the admin-typed one in cleartext.
      try {
        const { createHash, randomBytes } = await import('crypto');
        const raw = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(raw).digest('hex');
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h for onboarding
        await pool.query(
          'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
          [user.id, tokenHash, expires]
        );
        const link = `${process.env.APP_BASE_URL || ''}/reset-password?token=${raw}`;
        sendMail({
          to: email,
          subject: 'Välkommen till Access Guardian',
          title: 'Ditt konto har skapats',
          body: `<p>Hej ${htmlEscape(full_name)},</p><p>Ett konto har skapats åt dig. Klicka på knappen nedan för att välja ditt lösenord. Länken gäller i 24 timmar.</p>`,
          ctaLabel: 'Välj lösenord',
          ctaUrl: link,
        }).catch(() => {});
      } catch (err) {
        console.warn('[users] welcome email setup failed:', err.message);
      }
    }
    res.status(201).json({ ...pub, roles: roles || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.constraint === 'users_email_key') return res.status(409).json({ error: 'E-postadressen används redan' });
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

router.put('/:id', requireRole('administrator'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetId = req.params.id;
    const { email, full_name, first_name, last_name, password, roles, department, title, phone, manager_id, contact_person_id, company, is_active, org_unit_id } = req.body || {};

    const rolesErr = invalidRoles(roles);
    if (rolesErr) { await client.query('ROLLBACK'); return res.status(400).json({ error: rolesErr }); }
    if (await removesLastAdmin(client, targetId, { roles, is_active })) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Det måste finnas minst en aktiv administratör' });
    }

    const { rows: beforeRows } = await client.query(
      'SELECT is_active, manager_id FROM users WHERE id = $1 FOR UPDATE', [targetId]);
    if (beforeRows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ej hittad' }); }
    const before = beforeRows[0];

    const updates = [];
    const vals = [];
    let idx = 1;
    const addField = (name, val) => { if (val !== undefined) { updates.push(`${name} = $${idx++}`); vals.push(val); } };

    if (email !== undefined) {
      if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Ogiltig e-postadress' });
      }
    }

    addField('email', email);
    addField('full_name', full_name ? full_name.slice(0, 255) : full_name);
    addField('first_name', first_name !== undefined ? (first_name || '').slice(0, 128) : undefined);
    addField('last_name', last_name !== undefined ? (last_name || '').slice(0, 128) : undefined);
    addField('department', department !== undefined ? (department || '').slice(0, 100) : undefined);
    addField('title', title !== undefined ? (title || '').slice(0, 255) : undefined);
    addField('phone', phone !== undefined ? (phone || '').slice(0, 50) : undefined);
    if (manager_id !== undefined) {
      const chainErr = await managerChainError(client, targetId, manager_id || null);
      if (chainErr) { await client.query('ROLLBACK'); return res.status(400).json({ error: chainErr }); }
    }
    // Only touch manager/sponsor when the caller actually sent them.
    if (manager_id !== undefined) addField('manager_id', manager_id || null);
    if (contact_person_id !== undefined) addField('contact_person_id', contact_person_id || null);
    addField('company', company !== undefined ? (company || '').slice(0, 255) : undefined);
    addField('is_active', is_active);
    if (org_unit_id !== undefined) addField('org_unit_id', org_unit_id || null);
    const sub = await validateSubstitute(client, targetId, req.body || {});
    if (sub.error) { await client.query('ROLLBACK'); return res.status(400).json({ error: sub.error }); }
    for (const [k, v] of Object.entries(sub.value)) addField(k, v);

    if (password) {
      const policy = await getPasswordPolicy();
      const policyErr = validatePassword(password, policy);
      if (policyErr) { await client.query('ROLLBACK'); return res.status(400).json({ error: policyErr }); }
      const hash = await bcrypt.hash(password, 12);
      addField('password_hash', hash);
      addField('must_change_password', true);
      updates.push('password_changed_at = now()');
    }

    if (updates.length > 0) {
      vals.push(targetId);
      await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
    }

    if (roles !== undefined) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [targetId]);
      for (const role of roles) {
        await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [targetId, role]);
      }
    }

    // Deactivation closes the account's access: approved access is revoked and
    // pending applications are withdrawn, in the same transaction.
    let revoked = [];
    let withdrawn = [];
    if (before.is_active && is_active === false) {
      ({ rows: revoked } = await client.query(
        `UPDATE applications
            SET status = 'expired', revoked_at = now(), revoked_by = $2, revoke_reason = 'Kontot inaktiverat',
                status_changed_at = now(), reminded_at = NULL, escalated_at = NULL
          WHERE applicant_id = $1 AND status = 'approved'
          RETURNING id, facility_id`,
        [targetId, req.user.id]
      ));
      ({ rows: withdrawn } = await client.query(
        `UPDATE applications
            SET status = 'denied', denied_reason = 'Ansökan återkallad – kontot inaktiverat',
                status_changed_at = now(), reminded_at = NULL, escalated_at = NULL
          WHERE applicant_id = $1 AND status IN ('draft', 'pending_manager', 'pending_facility', 'pending_exception')
          RETURNING id`,
        [targetId]
      ));
    }
    const newManagerId = manager_id !== undefined ? (manager_id || null) : before.manager_id;
    const managerChanged = !!newManagerId && newManagerId !== before.manager_id;
    await client.query('COMMIT');

    // Return updated user
    const { rows } = await client.query(
      `${USER_SELECT} WHERE u.id = $1 GROUP BY u.id`,
      [targetId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ej hittad' });
    const { password_hash, ...pub } = rows[0];
    const changed = [];
    if (roles !== undefined) changed.push(`roller=${(roles || []).join(',')}`);
    if (is_active !== undefined) changed.push(`aktiv=${is_active}`);
    if (password) changed.push('lösenord');
    await audit({ req, action: 'user_updated', targetId, targetType: 'user', details: changed.join('; ') || 'profiluppdatering' });

    // ----- Post-commit side effects -----
    for (const r of revoked) {
      await audit({ req, action: 'access_revoked', targetId: r.id, targetType: 'application', details: 'Kontot inaktiverat' });
    }
    for (const w of withdrawn) {
      await audit({ req, action: 'application_denied', targetId: w.id, targetType: 'application', details: 'Ansökan återkallad – kontot inaktiverat' });
    }
    if (revoked.length > 0) {
      const facilityIds = [...new Set(revoked.map(r => r.facility_id))];
      const { rows: owners } = await pool.query(
        'SELECT DISTINCT owner_id FROM facilities WHERE id = ANY($1) AND owner_id IS NOT NULL', [facilityIds]);
      for (const o of owners) {
        await notifyUser(pool, o.owner_id, {
          title: 'Tillträde återkallat – kontot inaktiverat',
          message: `${pub.full_name} har inaktiverats och tillträdet till din anläggning har återkallats.`,
          type: 'warning',
          link: '/applications',
        });
      }
    }
    let notifiedManager = false;
    if (managerChanged) {
      const { rows: waiting } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM applications WHERE applicant_id = $1 AND status = 'pending_manager'`, [targetId]);
      if (waiting[0].n > 0) {
        await notifyUser(pool, newManagerId, {
          title: 'Ansökningar väntar på din attestering',
          message: `Du är nu närmaste chef för ${pub.full_name}, som har ${waiting[0].n} ansökan/ansökningar som väntar på attestering.`,
          type: 'action_required',
          link: '/applications',
        });
        notifiedManager = true;
      }
      await audit({ req, action: 'user_updated', targetId, targetType: 'user', details: `Ny närmaste chef: ${newManagerId}` });
    }
    res.json({ ...pub, roles: pub.roles || [], side_effects: { revoked: revoked.length, withdrawn: withdrawn.length, notified_manager: notifiedManager } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    if (err.constraint === 'users_email_key') return res.status(409).json({ error: 'E-postadressen används redan' });
    res.status(500).json({ error: 'Internt serverfel' });
  } finally {
    client.release();
  }
});

const MAX_IMPORT_ROWS = 500;

// POST /api/users/import  { rows: [{ email, fornamn, efternamn, telefon, befattning,
// avdelning, foretag, chef_email, roller }] }
// Creates new users with temporary passwords (must change at first login).
// Existing e-mail addresses are skipped. Managers are linked in a second pass,
// so a manager may appear anywhere in the file. Temporary passwords are only
// returned in this response; they are never stored in plain text or logged.
router.post('/import', requireRole('administrator'), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'Inga rader att importera' });
  if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Max ${MAX_IMPORT_ROWS} rader per import` });

  const results = [];
  const createdByEmail = new Map(); // email -> { id, result }
  const seen = new Set();
  try {
    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 1;
      const check = validateImportRow(rows[i] || {});
      if (!check.ok) {
        results.push({ row: rowNo, email: String(rows[i]?.email ?? ''), status: 'error', message: check.error });
        continue;
      }
      const v = check.value;
      if (seen.has(v.email)) {
        results.push({ row: rowNo, email: v.email, status: 'error', message: 'E-postadressen finns flera gånger i filen' });
        continue;
      }
      seen.add(v.email);
      const { rows: existing } = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [v.email]);
      if (existing.length > 0) {
        results.push({ row: rowNo, email: v.email, status: 'skipped', message: 'Användaren finns redan' });
        continue;
      }
      const tempPassword = generateTempPassword();
      // Cost 10 (not 12): the password must be changed at first login anyway,
      // and a 500-row import stays well under a minute.
      const hash = await bcrypt.hash(tempPassword, 10);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: created } = await client.query(
          `INSERT INTO users (email, full_name, first_name, last_name, password_hash, department, title, phone, company, is_active, must_change_password)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true) RETURNING id`,
          [v.email, v.full_name, v.first_name, v.last_name, hash, v.department, v.title, v.phone, v.company]
        );
        for (const role of v.roles) {
          await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [created[0].id, role]);
        }
        await client.query('COMMIT');
        const result = { row: rowNo, email: v.email, status: 'created', temp_password: tempPassword };
        results.push(result);
        createdByEmail.set(v.email, { id: created[0].id, managerEmail: v.manager_email, result });
        await audit({ req, action: 'user_created', targetId: created[0].id, targetType: 'user', details: `Import: ${v.email}, roller: ${v.roles.join(',')}` });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[import] row failed', err.message);
        results.push({ row: rowNo, email: v.email, status: 'error', message: 'Kunde inte skapa användaren' });
      } finally {
        client.release();
      }
    }

    // Second pass: link managers (existing users or users created above).
    for (const { id, managerEmail, result } of createdByEmail.values()) {
      if (!managerEmail) continue;
      let managerId = createdByEmail.get(managerEmail)?.id;
      if (!managerId) {
        const { rows: m } = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [managerEmail]);
        managerId = m[0]?.id;
      }
      if (!managerId || managerId === id) {
        result.message = 'Skapad, men chefen hittades inte';
        continue;
      }
      await pool.query('UPDATE users SET manager_id = $1 WHERE id = $2', [managerId, id]);
    }

    const count = (st) => results.filter(r => r.status === st).length;
    await audit({ req, action: 'user_created', targetType: 'user', details: `CSV-import: ${count('created')} skapade, ${count('skipped')} fanns redan, ${count('error')} fel` });
    res.json({ results });
  } catch (err) {
    console.error('[import] failed', err);
    res.status(500).json({ error: 'Internt serverfel', results });
  }
});

// How many applications a deactivation would affect (for the confirmation dialog).
router.get('/:id/deactivation-preview', requireRole('administrator'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
              COUNT(*) FILTER (WHERE status IN ('draft', 'pending_manager', 'pending_facility', 'pending_exception'))::int AS pending
         FROM applications WHERE applicant_id = $1`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

router.delete('/:id', requireRole('administrator'), async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(403).json({ error: 'Du kan inte ta bort ditt eget konto' });
    }
    if (await removesLastAdmin(pool, targetId, { is_active: false })) {
      return res.status(400).json({ error: 'Det måste finnas minst en aktiv administratör' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    await audit({ req, action: 'user_deleted', targetId, targetType: 'user' });
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') {
      // Still referenced by applications or owned facilities.
      return res.status(409).json({ error: 'Användaren har ansökningar eller äger anläggningar och kan inte tas bort. Inaktivera kontot i stället.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
