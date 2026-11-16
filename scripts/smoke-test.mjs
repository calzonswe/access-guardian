// End-to-end smoke test for the full stack (db + backend + nginx frontend).
//
// Runs against a FRESH database: it creates users, a facility and applications.
// Use a separate compose project so your normal data is untouched:
//
//   cat > /tmp/smoke.env <<ENV
//   DB_PASSWORD=smoke_db_pw
//   JWT_SECRET=$(openssl rand -hex 32)
//   INITIAL_ADMIN_PASSWORD=Smoke-Admin-1!
//   APP_PORT=8088
//   ENV
//   docker compose -p ag-smoke --env-file /tmp/smoke.env up -d --build
//   ADMIN_PW='Smoke-Admin-1!' node scripts/smoke-test.mjs
//   docker compose -p ag-smoke --env-file /tmp/smoke.env down -v
//
// Env: BASE (default http://localhost:8088/api), ADMIN_PW (initial admin password).
const BASE = process.env.BASE || 'http://localhost:8088/api';
const ADMIN_PW = process.env.ADMIN_PW;
const PW = 'Smoke-Test-1!';
const PW2 = 'Smoke-Test-2!';
const TEMP = 'Temp-Pass-9!';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ok   ${name}`); }
  else { fail++; results.push(`  FAIL ${name} ${extra}`); }
}

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function login(email, password) {
  const r = await call('POST', '/auth/login', null, { email, password });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
// Log in and complete the forced first-login password change.
async function onboard(email, tempPw) {
  const l = await login(email, tempPw);
  if (!l.mustChangePassword) return l.token;
  await sleep(1100); // new token must be issued in a later second than password_changed_at
  const c = await call('POST', '/auth/change-password', l.token, { newPassword: PW });
  if (c.status !== 200) throw new Error(`change pw ${email}: ${c.status} ${JSON.stringify(c.data)}`);
  return c.data.token;
}

async function main() {
  // ---------- Admin: forced password change ----------
  const a0 = await login('admin@foretag.se', ADMIN_PW);
  check('admin must change password on first login', a0.mustChangePassword === true);
  const blocked = await call('GET', '/users', a0.token);
  check('API blocked until password is changed (403)', blocked.status === 403, `got ${blocked.status}`);
  await sleep(1100);
  const ac = await call('POST', '/auth/change-password', a0.token, { newPassword: PW });
  check('forced password change works without current password', ac.status === 200, JSON.stringify(ac.data));
  const admin = ac.data.token;
  const old = await call('GET', '/auth/me', a0.token);
  check('token from before the password change is rejected (401)', old.status === 401, `got ${old.status}`);

  // ---------- Admin sets up users ----------
  const mk = async (email, full_name, roles, extra = {}) => {
    const r = await call('POST', '/users', admin, { email, full_name, password: TEMP, roles, ...extra });
    if (r.status !== 201) throw new Error(`create ${email}: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.id;
  };
  const badRole = await call('POST', '/users', admin, { email: 'bad@x.se', full_name: 'Bad', password: PW, roles: ['superuser'] });
  check('unknown role rejected with 400 (not 500)', badRole.status === 400, `got ${badRole.status}`);

  const foId = await mk('owner@x.se', 'Olle Ägare', ['facility_owner']);
  const faId = await mk('fadmin@x.se', 'Frida Anläggningsadmin', ['facility_admin']);
  const mId = await mk('manager@x.se', 'Maja Chef', ['line_manager', 'employee']);
  const eId = await mk('employee@x.se', 'Erik Anställd', ['employee'], { manager_id: mId });
  const pId = await mk('peer@x.se', 'Petra Kollega', ['line_manager', 'employee'], { manager_id: mId });
  const xId = await mk('other@x.se', 'Xavier Utomstående', ['employee']);

  // ---------- Facility, areas, requirements ----------
  const fac = await call('POST', '/facilities', admin, { name: 'Lager Nord', description: 'Testanläggning', address: 'Gatan 1', owner_id: foId });
  check('admin creates facility', fac.status === 201, JSON.stringify(fac.data));
  const fId = fac.data.id;
  const addAdmin = await call('POST', `/facilities/${fId}/admins`, admin, { user_id: faId });
  check('admin assigns facility admin', addAdmin.status === 200);
  const a1 = await call('POST', '/areas', admin, { facility_id: fId, name: 'Entré', security_level: 'low' });
  const a2 = await call('POST', '/areas', admin, { facility_id: fId, name: 'Serverrum', security_level: 'high', parent_id: a1.data.id });
  check('areas created (incl. sub-area)', a1.status === 201 && a2.status === 201);
  const req = await call('POST', '/requirements', admin, { name: 'Säkerhetsutbildning', type: 'training', has_expiry: false });
  check('requirement created', req.status === 201, JSON.stringify(req.data));
  const link = await call('POST', '/area-requirements', admin, { area_id: a2.data.id, requirement_id: req.data.id });
  check('requirement linked to area', link.status === 201 || link.status === 200, `got ${link.status}`);

  // ---------- Everyone logs in ----------
  const fo = await onboard('owner@x.se', TEMP);
  const fa = await onboard('fadmin@x.se', TEMP);
  const m = await onboard('manager@x.se', TEMP);
  const e = await onboard('employee@x.se', TEMP);
  const p = await onboard('peer@x.se', TEMP);
  const x = await onboard('other@x.se', TEMP);

  // ---------- Non-admin data access (P0 #2, #4) ----------
  check('employee: /logs is admin-only (403)', (await call('GET', '/logs', e)).status === 403);
  const eAreas = await call('GET', `/areas?facility_id=${fId}`, e);
  check('employee can list areas of a facility', eAreas.status === 200 && eAreas.data.length === 2, JSON.stringify(eAreas.data));
  const eAR = await call('GET', '/area-requirements', e);
  check('employee can see area requirement links', eAR.status === 200 && eAR.data.length === 1);
  check('employee can list facilities', (await call('GET', '/facilities', e)).data.length === 1);
  check('employee: user-requirements loads', (await call('GET', '/user-requirements', e)).status === 200);

  // ---------- Happy path: submit -> manager -> facility ----------
  const app1 = await call('POST', '/applications', e, { facility_id: fId, area_ids: [a1.data.id], status: 'pending_manager', start_date: '2026-12-01', end_date: '2027-06-30' });
  check('employee submits application directly (pending_manager)', app1.status === 201 && app1.data.status === 'pending_manager', JSON.stringify(app1.data));
  const id1 = app1.data.id;
  const mNotifs = await call('GET', '/notifications', m);
  check('manager is notified about the new application', mNotifs.data.some(n => n.link === `/applications/${id1}`), JSON.stringify(mNotifs.data.map(n => n.title)));

  const badDates = await call('POST', '/applications', e, { facility_id: fId, start_date: '2027-01-10', end_date: '2027-01-01' });
  check('end date before start date rejected (400)', badDates.status === 400);
  const badArea = await call('POST', '/applications', e, { facility_id: fId, area_ids: ['00000000-0000-0000-0000-000000000000'], start_date: '2027-01-10' });
  check('area from another facility rejected (400)', badArea.status === 400);

  check('employee cannot approve own application (403)', (await call('PUT', `/applications/${id1}`, e, { status: 'pending_facility' })).status === 403);
  check('peer line manager cannot approve colleague (403)', (await call('PUT', `/applications/${id1}`, p, { status: 'pending_facility' })).status === 403);
  check('peer cannot view colleague application (403)', (await call('GET', `/applications/${id1}`, p)).status === 403);
  check('unrelated user cannot edit dates (403)', (await call('PUT', `/applications/${id1}`, x, { end_date: '2099-01-01' })).status === 403);
  check('unrelated user cannot revoke (403)', (await call('PUT', `/applications/${id1}`, x, { status: 'expired' })).status === 403);
  check('invalid status value rejected (400, not 500)', (await call('PUT', `/applications/${id1}`, admin, { status: 'bogus' })).status === 400);
  const editOwn = await call('PUT', `/applications/${id1}`, e, { end_date: '2027-05-31' });
  check('applicant can edit while pending_manager', editOwn.status === 200, JSON.stringify(editOwn.data));

  // Two attachments, then check that areas/attachments are not duplicated (#22)
  for (const n of ['intyg1.txt', 'intyg2.txt']) {
    await call('POST', '/attachments', e, { application_id: id1, file_name: n, file_data: 'data:text/plain;base64,' + Buffer.from('hej').toString('base64'), mime_type: 'text/plain' });
  }
  await call('PUT', `/applications/${id1}`, e, { area_ids: [a1.data.id, a2.data.id] });
  const one = await call('GET', `/applications/${id1}`, m);
  check('manager can view team application', one.status === 200);
  check('no duplicated areas/attachments in single fetch', one.data?.area_ids?.length === 2 && one.data?.attachments?.length === 2,
    `areas=${one.data?.area_ids?.length} attachments=${one.data?.attachments?.length}`);
  const dl = await fetch(`${BASE}/attachments/${one.data.attachments[0].id}/download`, { headers: { Authorization: `Bearer ${p}` } });
  check('peer cannot download attachment (403)', dl.status === 403, `got ${dl.status}`);

  const mApprove = await call('PUT', `/applications/${id1}`, m, { status: 'pending_facility' });
  check('manager approves -> pending_facility', mApprove.status === 200 && mApprove.data.status === 'pending_facility', JSON.stringify(mApprove.data));
  check('applicant can no longer edit after manager approval (403)', (await call('PUT', `/applications/${id1}`, e, { end_date: '2099-01-01' })).status === 403);
  const faNotifs = await call('GET', '/notifications', fa);
  check('facility admin notified', faNotifs.data.some(n => n.link === `/applications/${id1}`));
  const faApprove = await call('PUT', `/applications/${id1}`, fa, { status: 'approved' });
  check('facility admin approves -> approved', faApprove.status === 200 && faApprove.data.status === 'approved', JSON.stringify(faApprove.data));
  check('approved application has approver stamps', !!faApprove.data.manager_approved_by && !!faApprove.data.facility_approved_by);

  // ---------- Exception flow (Q1: facility owner decides) ----------
  const app2 = await call('POST', '/applications', e, { facility_id: fId, area_ids: [a2.data.id], status: 'pending_manager', start_date: '2026-12-01', has_exception: true, exception_justification: 'Utbildning bokad' });
  const id2 = app2.data.id;
  check('exception application expanded to parent area', app2.data.area_ids?.length === 2, JSON.stringify(app2.data.area_ids));
  check('exception app cannot skip to pending_facility (403)', (await call('PUT', `/applications/${id2}`, m, { status: 'pending_facility' })).status === 403);
  const toExc = await call('PUT', `/applications/${id2}`, m, { status: 'pending_exception' });
  check('manager approves exception app -> pending_exception', toExc.status === 200 && toExc.data.status === 'pending_exception', JSON.stringify(toExc.data));
  const foNotifs = await call('GET', '/notifications', fo);
  check('facility owner notified about exception', foNotifs.data.some(n => n.link === `/applications/${id2}` && n.title.includes('Undantag')));
  check('facility admin cannot decide exception (403)', (await call('PUT', `/applications/${id2}`, fa, { status: 'approved' })).status === 403);
  const foApprove = await call('PUT', `/applications/${id2}`, fo, { status: 'approved' });
  check('facility owner approves exception', foApprove.status === 200 && !!foApprove.data.exception_approved_by, JSON.stringify(foApprove.data));

  // ---------- Deny with reason, revoke ----------
  const app3 = await call('POST', '/applications', e, { facility_id: fId, status: 'pending_manager', start_date: '2026-12-01' });
  check('denied_reason without denial rejected (400)', (await call('PUT', `/applications/${app3.data.id}`, m, { denied_reason: 'x' })).status === 400);
  const deny = await call('PUT', `/applications/${app3.data.id}`, m, { status: 'denied', denied_reason: '<b>Saknar behov</b>' });
  check('manager denies with reason', deny.status === 200 && deny.data.denied_reason === '<b>Saknar behov</b>');
  const revoke = await call('PUT', `/applications/${id1}`, fa, { status: 'expired' });
  check('facility admin revokes access', revoke.status === 200 && revoke.data.status === 'expired');

  // ---------- Draft -> submit ----------
  const draft = await call('POST', '/applications', e, { facility_id: fId, start_date: '2027-02-01' });
  check('application can be saved as draft', draft.data.status === 'draft');
  check('manager cannot submit someone else\'s draft (403)', (await call('PUT', `/applications/${draft.data.id}`, m, { status: 'pending_manager' })).status === 403);
  const submit = await call('PUT', `/applications/${draft.data.id}`, e, { status: 'pending_manager' });
  check('applicant submits draft', submit.status === 200 && submit.data.status === 'pending_manager');

  // ---------- Visibility in list ----------
  const mList = await call('GET', '/applications?page=1&limit=25', m);
  check('manager sees team applications in paged list', mList.status === 200 && mList.data.total >= 4, JSON.stringify({ total: mList.data?.total }));
  const xList = await call('GET', '/applications', x);
  check('unrelated user sees none', Array.isArray(xList.data) && xList.data.length === 0);

  // ---------- Users: manager preserved, deactivation (P1 #13, #19) ----------
  const deact = await call('PUT', `/users/${eId}`, admin, { is_active: false });
  check('toggling is_active keeps manager_id', deact.status === 200 && deact.data.manager_id === mId, JSON.stringify(deact.data));
  check('deactivated user token rejected (401)', (await call('GET', '/auth/me', e)).status === 401);
  await call('PUT', `/users/${eId}`, admin, { is_active: true });
  const clear = await call('PUT', `/users/${xId}`, admin, { manager_id: null });
  check('explicit null still clears manager', clear.status === 200 && clear.data.manager_id === null);
  const dup = await call('PUT', `/users/${xId}`, admin, { email: 'owner@x.se' });
  check('duplicate e-mail on update -> 409', dup.status === 409, `got ${dup.status}`);
  const meId = (await call('GET', '/auth/me', admin)).data.user.id;
  check('last admin cannot drop own admin role (400)', (await call('PUT', `/users/${meId}`, admin, { roles: ['employee'] })).status === 400);
  check('only admins edit users (403 for manager)', (await call('PUT', `/users/${eId}`, m, { title: 'x' })).status === 403);

  // ---------- Requirements: no self-certification (#12) ----------
  const ur = await call('POST', '/user-requirements', admin, { user_id: eId, requirement_id: req.data.id, status: 'pending' });
  check('admin registers requirement for user', ur.status === 201, JSON.stringify(ur.data));
  const e2 = (await login('employee@x.se', PW)).token;
  check('employee cannot self-certify (403)', (await call('PUT', `/user-requirements/${ur.data.id}`, e2, { status: 'fulfilled', expires_at: '2099-01-01' })).status === 403);
  check('manager cannot create requirements for self (403)', (await call('POST', '/user-requirements', m, { user_id: mId, requirement_id: req.data.id })).status === 403);

  // ---------- Profile, password, refresh ----------
  const prof = await call('PUT', '/auth/me', e2, { title: 'Lagerarbetare', phone: '070-123', roles: ['administrator'] });
  check('self-service profile update works', prof.status === 200 && prof.data.user.title === 'Lagerarbetare');
  check('profile update cannot change roles', !prof.data.user.roles.includes('administrator'));
  check('voluntary password change needs current password', (await call('POST', '/auth/change-password', e2, { newPassword: PW2 })).status === 400);
  check('wrong current password rejected', (await call('POST', '/auth/change-password', e2, { newPassword: PW2, currentPassword: 'nope' })).status === 400);
  const ref = await call('POST', '/auth/refresh', e2, {});
  check('token refresh returns a new token', ref.status === 200 && typeof ref.data.token === 'string');
  await sleep(1100);
  const pwOk = await call('POST', '/auth/change-password', e2, { newPassword: PW2, currentPassword: PW });
  check('password change with current password works', pwOk.status === 200);
  check('other sessions ended after password change', (await call('GET', '/auth/me', ref.data.token)).status === 401);

  // ---------- Facilities (#15, #23) ----------
  check('facility admin cannot change owner (403)', (await call('PUT', `/facilities/${fId}`, fa, { owner_id: faId })).status === 403);
  const partial = await call('PUT', `/facilities/${fId}`, fa, { address: 'Ny gata 2' });
  check('partial facility update keeps name', partial.status === 200 && partial.data.name === 'Lager Nord' && partial.data.address === 'Ny gata 2', JSON.stringify(partial.data));
  const areaPartial = await call('PUT', `/areas/${a2.data.id}`, fo, { description: 'Kallt' });
  check('partial area update keeps name and parent', areaPartial.status === 200 && areaPartial.data.name === 'Serverrum' && areaPartial.data.parent_id === a1.data.id, JSON.stringify(areaPartial.data));

  // ---------- Delete a user who has logged in (#21) ----------
  const del = await call('DELETE', `/users/${xId}`, admin);
  check('user with audit-log history can be deleted', del.status === 200, JSON.stringify(del.data));
  const delApplicant = await call('DELETE', `/users/${pId}`, admin);
  check('user without applications can be deleted', delApplicant.status === 200, JSON.stringify(delApplicant.data));
  const delE = await call('DELETE', `/users/${eId}`, admin);
  check('user with applications -> 409 with message', delE.status === 409, `got ${delE.status} ${JSON.stringify(delE.data)}`);

  // ---------- Public contractor form (#14) ----------
  const cap = await call('GET', '/contractor/captcha');
  const [aN, op, bN] = cap.data.question.split(' ');
  const ans = op === '+' ? +aN + +bN : op === '-' ? aN - bN : aN * bN;
  const existing = await call('POST', '/contractor/apply', null, {
    first_name: 'Fake', last_name: 'Person', email: 'employee@x.se', company: 'Evil AB', sponsor_email: 'manager@x.se',
    facility_id: fId, area_ids: [], start_date: '2026-12-01', captcha_token: cap.data.token, captcha_answer: ans,
  });
  check('contractor form refuses existing account (409)', existing.status === 409, `got ${existing.status}`);
  const cap2 = await call('GET', '/contractor/captcha');
  const [c1, cop, c2] = cap2.data.question.split(' ');
  const ans2 = cop === '+' ? +c1 + +c2 : cop === '-' ? c1 - c2 : c1 * c2;
  const fresh = await call('POST', '/contractor/apply', null, {
    first_name: 'Kim', last_name: 'Konsult', email: 'kim@konsult.se', company: 'Konsult AB', sponsor_email: 'manager@x.se',
    facility_id: fId, area_ids: [a1.data.id], start_date: '2026-12-01', captcha_token: cap2.data.token, captcha_answer: ans2,
  });
  check('new contractor can apply', fresh.status === 201 && !!fresh.data.temp_password, JSON.stringify(fresh.data));
  const sponsorView = await call('GET', `/applications/${fresh.data.application_id}`, m);
  check('sponsor can view contractor application', sponsorView.status === 200);
  const sponsorApprove = await call('PUT', `/applications/${fresh.data.application_id}`, m, { status: 'pending_facility' });
  check('sponsor can approve contractor application', sponsorApprove.status === 200, JSON.stringify(sponsorApprove.data));
  const mUsers = await call('GET', '/users', m);
  check('sponsor sees the contractor in user list', mUsers.data.some(u => u.email === 'kim@konsult.se'));

  // ========== User improvements (renew, history, substitutes, deactivation, import, log search) ==========
  const eNow = (await login('employee@x.se', PW2)).token;
  const iso = (d) => d.toISOString().slice(0, 10);
  const dayOffset = (n) => iso(new Date(Date.now() + n * 86400000));

  // #1 renewal links to the renewed application; someone else's id is ignored
  const renew = await call('POST', '/applications', eNow, { facility_id: fId, area_ids: [a2.data.id], status: 'pending_manager', start_date: dayOffset(30), renewed_from_id: id2, has_exception: true, exception_justification: 'Förlängning' });
  check('renewal records renewed_from_id', renew.status === 201 && renew.data.renewed_from_id === id2, JSON.stringify(renew.data?.renewed_from_id));
  const foreign = await call('POST', '/applications', m, { facility_id: fId, start_date: dayOffset(30), renewed_from_id: id2 });
  check('renewed_from_id of another applicant is ignored', foreign.status === 201 && !foreign.data.renewed_from_id);

  // #5 history
  const hist = await call('GET', `/applications/${id1}/history`, m);
  const hActions = (hist.data || []).map(h => h.action);
  check('history lists the steps in order', hist.status === 200
    && ['application_created', 'application_pending_facility', 'application_approved', 'access_revoked'].every(a => hActions.includes(a))
    && hActions.indexOf('application_created') < hActions.indexOf('application_approved'), JSON.stringify(hActions));
  check('history has actor names', (hist.data || []).some(h => h.actor_name === 'Maja Chef'));

  // #11 substitutes
  const subId = await mk('sub@x.se', 'Sara Ersättare', ['line_manager']);
  const sub = await onboard('sub@x.se', TEMP);
  const cands = await call('GET', '/users/managers', m);
  check('manager candidates list line managers', cands.status === 200 && cands.data.some(c => c.id === subId));
  check('substitute must be a line manager', (await call('PUT', '/auth/me', m, { substitute_id: faId })).status === 400);
  check('employees cannot set a substitute', (await call('PUT', '/auth/me', eNow, { substitute_id: subId })).status === 403);
  const setSub = await call('PUT', '/auth/me', m, { substitute_id: subId, substitute_from: dayOffset(-1), substitute_to: dayOffset(1) });
  check('manager sets an active substitute', setSub.status === 200 && setSub.data.user.substitute_id === subId);
  const meSub = await call('GET', '/auth/me', sub);
  check('substitute knows whom they stand in for', (meSub.data.user.substituting_for || []).includes(mId));
  const forSub = await call('POST', '/applications', eNow, { facility_id: fId, status: 'pending_manager', start_date: dayOffset(40) });
  const subNotifs = await call('GET', '/notifications', sub);
  check('active substitute is notified', subNotifs.data.some(n => n.link === `/applications/${forSub.data.id}`));
  check('active substitute sees the application', (await call('GET', '/applications', sub)).data.some(a => a.id === forSub.data.id));
  const subApprove = await call('PUT', `/applications/${forSub.data.id}`, sub, { status: 'pending_facility' });
  check('active substitute can approve', subApprove.status === 200, JSON.stringify(subApprove.data));
  await call('PUT', '/auth/me', m, { substitute_from: dayOffset(-10), substitute_to: dayOffset(-1) });
  const afterSub = await call('POST', '/applications', eNow, { facility_id: fId, status: 'pending_manager', start_date: dayOffset(50) });
  check('substitute outside the period cannot approve', (await call('PUT', `/applications/${afterSub.data.id}`, sub, { status: 'pending_facility' })).status === 403);
  await call('PUT', '/auth/me', m, { substitute_id: null, substitute_from: null, substitute_to: null });

  // #17 deactivation revokes and withdraws
  const dId = await mk('leaver@x.se', 'Lars Slutar', ['employee'], { manager_id: mId });
  const d = await onboard('leaver@x.se', TEMP);
  const dApp = await call('POST', '/applications', d, { facility_id: fId, status: 'pending_manager', start_date: dayOffset(-5) });
  await call('PUT', `/applications/${dApp.data.id}`, m, { status: 'pending_facility' });
  await call('PUT', `/applications/${dApp.data.id}`, fo, { status: 'approved' });
  const dPending = await call('POST', '/applications', d, { facility_id: fId, status: 'pending_manager', start_date: dayOffset(5) });
  const preview = await call('GET', `/users/${dId}/deactivation-preview`, admin);
  check('deactivation preview counts', preview.data.approved === 1 && preview.data.pending === 1, JSON.stringify(preview.data));
  const deact2 = await call('PUT', `/users/${dId}`, admin, { is_active: false });
  check('deactivation revokes and withdraws', deact2.data.side_effects?.revoked === 1 && deact2.data.side_effects?.withdrawn === 1, JSON.stringify(deact2.data.side_effects));
  const revokedApp = await call('GET', `/applications/${dApp.data.id}`, admin);
  check('revoked with reason', revokedApp.data.status === 'expired' && revokedApp.data.revoke_reason === 'Kontot inaktiverat');
  check('pending withdrawn', (await call('GET', `/applications/${dPending.data.id}`, admin)).data.status === 'denied');
  check('owner notified about revoked access', (await call('GET', '/notifications', fo)).data.some(n => n.title === 'Tillträde återkallat – kontot inaktiverat'));
  const deactAgain = await call('PUT', `/users/${dId}`, admin, { is_active: false });
  check('deactivating again changes nothing', deactAgain.data.side_effects?.revoked === 0 && deactAgain.data.side_effects?.withdrawn === 0);

  // #18 manager change
  const cId = await mk('nochief@x.se', 'Nina Utanchef', ['employee']);
  const c = await onboard('nochief@x.se', TEMP);
  await call('POST', '/applications', c, { facility_id: fId, status: 'pending_manager', start_date: dayOffset(10) });
  check('no-manager application goes to administrators', (await call('GET', '/notifications', admin)).data.some(n => n.title === 'Ansökan saknar beslutsfattare'));
  const chg = await call('PUT', `/users/${cId}`, admin, { manager_id: mId });
  check('manager change notifies the new manager', chg.data.side_effects?.notified_manager === true
    && (await call('GET', '/notifications', m)).data.some(n => n.title === 'Ansökningar väntar på din attestering'));

  // #19 CSV import
  const imp = await call('POST', '/users/import', admin, { rows: [
    { email: 'ny.chef@x.se', fornamn: 'Ny', efternamn: 'Chef', roller: 'Linjechef|Anställd' },
    { email: 'ny.medarbetare@x.se', fornamn: 'Ny', efternamn: 'Medarbetare', chef_email: 'ny.chef@x.se', roller: 'Anställd' },
    { email: 'employee@x.se', fornamn: 'Erik', efternamn: 'Dubblett' },
    { email: 'inte-en-adress', fornamn: 'X', efternamn: 'Y' },
    { email: 'okand.roll@x.se', fornamn: 'X', efternamn: 'Y', roller: 'Chef' },
  ] });
  const st = (imp.data?.results || []).map(r => r.status);
  check('import reports created/skipped/error per row', JSON.stringify(st) === JSON.stringify(['created', 'created', 'skipped', 'error', 'error']), JSON.stringify(imp.data));
  check('import returns temp passwords only for created rows', imp.data.results.filter(r => r.temp_password).length === 2);
  const impLogin = await call('POST', '/auth/login', null, { email: 'ny.medarbetare@x.se', password: imp.data.results[1].temp_password });
  check('imported user logs in and must change password', impLogin.status === 200 && impLogin.data.mustChangePassword === true);
  const newChef = (await call('GET', '/users', admin)).data.find(u => u.email === 'ny.chef@x.se');
  check('import links the manager from the same file', (await call('GET', '/users', admin)).data.find(u => u.email === 'ny.medarbetare@x.se')?.manager_id === newChef?.id);
  check('import refuses more than 500 rows', (await call('POST', '/users/import', admin, { rows: Array.from({ length: 501 }, (_, i) => ({ email: `x${i}@x.se` })) })).status === 400);
  check('only admins can import', (await call('POST', '/users/import', m, { rows: [{ email: 'a@b.se', fornamn: 'A', efternamn: 'B' }] })).status === 403);

  // #21 log search
  const ls = await call('GET', '/logs?page=1&pageSize=50&q=CSV-import', admin);
  check('log search finds a known entry', ls.status === 200 && ls.data.total >= 1 && ls.data.items[0].actor_name === 'Systemadministratör', JSON.stringify({ total: ls.data?.total }));
  const lf = await call('GET', `/logs?page=1&pageSize=50&from=${dayOffset(1)}`, admin);
  check('log date filter excludes everything after today', lf.status === 200 && lf.data.total === 0);

  // ---------- Audit log ----------
  const logs = await call('GET', '/logs?page=1&pageSize=200', admin);
  const actions = new Set(logs.data.items.map(l => l.action));
  for (const a of ['application_created', 'application_pending_facility', 'application_approved', 'application_pending_exception', 'application_denied', 'access_revoked', 'user_created']) {
    check(`audit log contains ${a}`, actions.has(a));
  }

  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.log(results.join('\n')); console.error('\nABORTED:', err.message); process.exit(2); });
