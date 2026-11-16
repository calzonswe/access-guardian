# User Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 13 improvements in the spec: renew, apply again, requirement checklist,
history, the "att hantera" inbox, substitutes, stuck-application reminders, the active-access
list, deactivation side effects, manager change, CSV import, log search and remembered filters.

**Architecture:**
- **Backend:** owns rules and side effects. That covers the substitute permission, deactivation
  and manager change, reminders, import, history and log search. Pure rule functions go in small
  modules under `backend/src/services/` with `node:test` tests.
- **Frontend:** computes pure views from the existing `dataStore` cache (inbox count, active
  access, requirement checklist). One migration adds the needed columns.

**Tech Stack:** Express (plain ESM JS), PostgreSQL 16, React 18 + TypeScript + shadcn/ui, vitest, node:test.

**Spec:** `docs/superpowers/specs/2026-11-15-user-improvements-design.md`

## Global Constraints

- UI strings, errors and commit messages are in Swedish. Use the existing token classes, never raw colours.
- Schema changes go only in `db/migrations/0008_user_improvements.sql`, which must apply on top of a fresh `init.sql`.
- New data features need both `api.ts` and the API branch of `dataStore.ts`. The localStorage branch gets a sensible no-op or local equivalent.
- The `TRANSITIONS` table is unchanged. The only new approver is an active substitute of the applicant's manager.
- The applicant never approves their own application, including as a substitute.
- Reminder threshold defaults: 3 days to remind, 7 days to escalate; 0 disables either.
- CSV import: max 500 rows; headers `email;fornamn;efternamn;telefon;befattning;avdelning;foretag;chef_email;roller`; roles separated by `|`; existing e-mails skipped; temp passwords returned once, never stored or logged.
- Log export: up to 10,000 rows.
- Remembered filters: `sessionStorage`.

## Review Focus

1. A substitute whose date range has ended, or hasn't started, must lose and not yet have
   approval rights. Covered by Task 2's tests at the `from` and `to` boundary days.
2. A CSV file saved by Swedish Excel (`;`, BOM, CRLF, quoted fields containing `;`) must parse
   to the right columns. Covered by Task 7's parser tests.
3. Deactivating an already-inactive user must not revoke anything twice or send notifications
   again. Covered by Task 3's smoke check of a second deactivation.
4. A renewal opened from an expired application whose facility areas were later deleted must
   still open, with just the remaining areas selected. Covered by a guard in Task 9 (filter
   `area_ids` to existing areas).
5. A reminder must not fire again after the job runs a second time, or after the status changes
   back and forth. Covered by Task 4's selection test and manual check.

---

### Task 1: Migration and status timestamps

**Files:**
- Create: `db/migrations/0008_user_improvements.sql`
- Modify: `backend/src/routes/applications.js` (PUT and POST set `status_changed_at`, clear `reminded_at`/`escalated_at`)

**Interfaces:**
- Produces:
  - Columns `applications.status_changed_at`, `reminded_at`, `escalated_at`, `renewed_from_id`
    (FK `ON DELETE SET NULL`).
  - Columns `users.substitute_id` (FK `ON DELETE SET NULL`), `substitute_from DATE`, `substitute_to DATE`.
  - `POST /api/applications` accepts `renewed_from_id`, which must be an application of the same
    applicant (otherwise ignored).

- [x] Write the migration with `ADD COLUMN IF NOT EXISTS`, and backfill `status_changed_at = COALESCE(updated_at, created_at)`.
- [x] In the PUT handler, when `newStatus` is set, add `status_changed_at = now()`, `reminded_at = NULL` and `escalated_at = NULL` to the update.
- [x] Run `node --check` and `cd backend && npm test`; expect 8 passing.
- [x] Commit.

### Task 2: Substitute rules (backend)

**Files:**
- Create: `backend/src/services/substitutes.js`
- Create: `backend/test/substitutes.test.js`
- Modify: `backend/src/routes/applications.js` (`getApplicationAccess`, `notifyApprovers`, GET list scope)
- Modify: `backend/src/routes/users.js` (new `GET /managers`, admin PUT fields, GET visibility)
- Modify: `backend/src/routes/auth.js` (`PUT /me` substitute fields, `mapUser` output)

**Interfaces:**
- Produces:
  - `isSubstituteActive({ substitute_id, substitute_from, substitute_to }, userId, today = new Date()): boolean`.
    `from` and `to` are inclusive `YYYY-MM-DD` strings, and either may be null (open-ended).
  - `async getActiveSubstituteId(db, managerId): Promise<string|null>`.
  - `async getAbsentManagerIdsFor(db, userId): Promise<string[]>`, returning the managers this user
    currently substitutes for.
  - `GET /api/users/managers` returns `[{id, full_name}]` for active users with the line manager
    role. Callable by any authenticated user.
  - `mapUser` and `USER_SELECT` include `substitute_id`, `substitute_from` and `substitute_to`.

- [x] Write the tests:
  - `isSubstituteActive` is true on the `from` day and the `to` day.
  - It is false the day before `from` and the day after `to`.
  - It is false when `substitute_id` is a different user.
  - It is true when both dates are null.
- [x] Run `cd backend && npm test`; expect FAIL (module missing).
- [x] Implement `substitutes.js`, comparing dates as `YYYY-MM-DD` strings in local time.
- [x] Wire the rules into `applications.js`:
  - In `getApplicationAccess`, `isApprovingManager` is also true when the user is the active
    substitute of `scope.managerId`, and never when the user is the applicant.
  - `notifyApprovers('pending_manager')` adds the manager's active substitute.
  - The list `GET /` adds the direct reports of each manager returned by `getAbsentManagerIdsFor`.
- [x] Wire the rules into the user routes:
  - `users.js` `GET /` and `GET /:id` make those direct reports visible.
  - `PUT /api/auth/me` accepts substitute fields only for line managers, rejects
    `substitute_id === self`, and requires that the substitute has the line manager role.
  - The admin `PUT /users/:id` accepts the same fields.
- [x] Run tests (12 passing) and `node --check`.
- [x] Commit.

### Task 3: Deactivation and manager change side effects

**Files:**
- Modify: `backend/src/routes/users.js` (PUT)

**Interfaces:**
- Produces: the `PUT /api/users/:id` response includes `side_effects: { revoked: number, withdrawn: number, notified_manager: boolean }`.
- Produces: `GET /api/users/:id/deactivation-preview` (admin) returns `{ approved: number, pending: number }` for the confirmation dialog.

- [x] **Deactivation:** read the current `is_active` and `manager_id` before the update. If it goes
  from true to false, inside the same transaction:
  - `UPDATE applications SET status='expired', revoked_at=now(), revoked_by=$admin, revoke_reason='Kontot inaktiverat', status_changed_at=now() WHERE applicant_id=$1 AND status='approved' RETURNING id, facility_id`.
  - `UPDATE applications SET status='denied', denied_reason='Ansökan återkallad – kontot inaktiverat', status_changed_at=now() WHERE applicant_id=$1 AND status IN ('draft','pending_manager','pending_facility','pending_exception') RETURNING id`.
- [x] **After commit:**
  - Audit `access_revoked` or `application_denied` per application.
  - Notify the owners of the affected facilities, once per facility: "Tillträde återkallat – kontot inaktiverat".
- [x] **Manager change:** if `manager_id` changed to a non-null value, after commit notify the new
  manager once ("Ansökningar väntar på din attestering", link `/applications`) when the user has
  any `pending_manager` application, and write an audit entry.
- [x] Add the preview endpoint.
- [x] Run `node --check`, then commit.

### Task 4: Reminders for stuck applications

**Files:**
- Create: `backend/src/services/approvers.js` (moved from `notifyApprovers`' recipient logic in `applications.js`)
- Create: `backend/test/reminders.test.js`
- Modify: `backend/src/jobs/expiryJob.js`, `backend/src/routes/applications.js`, `backend/src/services/settings.js`

**Interfaces:**
- Produces:
  - `async approverIdsFor(db, scope, status): Promise<string[]>` in `approvers.js`. It covers
    manager, sponsor, active substitute, facility staff, owner, and the administrator fallback.
    `applications.js` `notifyApprovers` uses it.
  - `reminderAction(app, now, { remindAfterDays, escalateAfterDays }): 'remind'|'escalate'|null`.
    `app` has `status_changed_at`, `reminded_at` and `escalated_at`. Escalation takes priority;
    each action fires at most once per status; 0 disables the action.
  - `getReminderSettings()` in `settings.js` returns `{ remindAfterDays: 3, escalateAfterDays: 7 }`
    from `notifications.remindAfterDays` and `notifications.escalateAfterDays`.
  - The job result gains `reminded` and `escalated` counts.

- [x] Write the tests:
  - At 2 days → null; at 3 days → `remind`.
  - At 3 days with `reminded_at` set → null.
  - At 7 days → `escalate`; at 7 days with `escalated_at` set → null.
  - `remindAfterDays: 0` disables reminders.
- [x] Run; expect FAIL.
- [x] Implement `reminderAction` (in `approvers.js`) and `approverIdsFor`, and switch `notifyApprovers` to use the latter.
- [x] Add `processStuckApplications(client, settings)` to the job:
  - Select `pending_*` applications.
  - For each one, call `reminderAction`. A reminder notifies the approvers ("Påminnelse: ansökan väntar på ditt beslut"); an escalation notifies active administrators ("Ansökan har väntat i N dagar").
  - Set `reminded_at` or `escalated_at` accordingly.
- [x] Run the tests (17 passing), then commit.

### Task 5: History and log search endpoints

**Files:**
- Modify: `backend/src/routes/applications.js` (new `GET /:id/history`)
- Modify: `backend/src/routes/logs.js` (`q`, `from`, `to`, export cap)

**Interfaces:**
- Produces:
  - `GET /api/applications/:id/history` → `[{ id, action, created_at, actor_name, details }]`,
    oldest first. Same `canView` rule as the application. It includes log rows whose `target_id`
    is the application or one of its attachments.
  - `GET /api/logs?page&pageSize&q&from&to&action` → `{ items, total, page, pageSize }`, with
    `pageSize` up to 10,000. `q` is an ILIKE over action, details and actor `full_name`; `from`
    and `to` are inclusive dates. Items include `actor_name`.

- [x] Implement both endpoints, then run `node --check`.
- [x] Commit.

### Task 6: Renewal entry point in the expiry reminder

**Files:**
- Modify: `backend/src/jobs/expiryJob.js` (`processUpcomingApplications` link `/applications/${id}?renew=1`)

- [x] Change the link and the message to "…Förnya i god tid via knappen Förläng."
- [x] Commit (together with Task 4 if convenient).

### Task 7: CSV import (backend and parser)

**Files:**
- Create: `backend/src/services/userImport.js`
- Create: `backend/test/userImport.test.js`
- Create: `src/lib/csv.ts`
- Create: `src/lib/csv.test.ts`
- Modify: `backend/src/routes/users.js` (`POST /import`, admin only)

**Interfaces:**
- Produces:
  - `parseCsv(text: string): { headers: string[]; rows: Record<string,string>[] }` in `src/lib/csv.ts`.
    It strips the BOM, auto-detects `;` or `,` from the header line, handles quotes with escaped
    `""` and CRLF, lowercases and trims headers, and drops empty lines.
  - `toCsv(rows: Record<string, string>[], headers: string[]): string`, `;`-separated with quoting.
  - `parseRoles(value: string): string[] | null` in `userImport.js`. It maps Swedish labels
    (case-insensitive: Administratör, Anläggningsägare, Anläggningsadministratör, Linjechef,
    Anställd, Entreprenör) and role keys, split on `|`, and returns null if any value is unknown.
    An empty value gives `['employee']`.
  - `validateImportRow(row): { ok: true, value } | { ok: false, error: string }` checks email,
    first and last name, and roles.
  - `POST /api/users/import` takes `{ rows: Record<string,string>[] }` (max 500, else 400) and
    returns `{ results: [{ row: number, email, status: 'created'|'skipped'|'error', message?, temp_password? }] }`.
    It processes rows in order, and `chef_email` resolves against existing users and rows created
    earlier in the same import. Temp passwords come from the generator in `contractor.js` (moved
    to `userImport.js` as `generateTempPassword()`).

- [x] Write the tests:
  - **`csv.test.ts`:** semicolon with a BOM and CRLF; comma; a quoted field containing `;` and `""`.
  - **`userImport.test.js`:**
    - `parseRoles('Linjechef|anställd')` → `['line_manager','employee']`.
    - `parseRoles('chef')` → null.
    - `validateImportRow` rejects a bad e-mail and missing names.
- [x] Run; expect FAIL.
- [x] Implement, then run `npm run test` and `cd backend && npm test`; all pass.
- [x] Commit.

### Task 8: Inbox counter and remembered filters (#9, #27)

**Files:**
- Create: `src/lib/applicationRules.ts`
- Create: `src/lib/applicationRules.test.ts`
- Create: `src/hooks/usePersistentState.ts`
- Modify: `src/components/applications/ApplicationDetailDialog.tsx` (use `canActOn`)
- Modify: `src/components/layout/AppSidebar.tsx` (badge)
- Modify: `src/pages/ApplicationsPage.tsx` (filter option `actionable`, persisted filters)
- Modify: `src/pages/UsersPage.tsx`, `src/pages/LogsPage.tsx` (persisted filters)

**Interfaces:**
- Produces:
  - `canActOn(app: Application, user: User, ctx: { facility?: Facility; applicant?: User; substituteFor?: string[] }): boolean`.
    It mirrors the transition rules: manager step for the manager, sponsor, line manager or active
    substitute of the applicant's manager; facility step for that facility's staff; exception step
    for the owner; administrators on any pending status; never the applicant.
  - `usePersistentState<T>(key: string, initial: T): [T, (v: T) => void]`, backed by `sessionStorage` under `ag:filter:<key>`.

- [x] Write the tests: the applicant can't act on their own application; a facility admin can't
  act on `pending_exception` but the owner can; an administrator can act on any pending status.
- [x] Run; expect FAIL.
- [x] Implement, and wire up:
  - The dialog's `canApprove` uses `canActOn`.
  - The sidebar shows a count badge on Ansökningar when it is above 0.
  - The ApplicationsPage status filter gains "Att hantera (n)", filtered client-side from the cache.
- [x] Persist search and status on Ansökningar, search, role and status on Användare, and the filters on Systemlogg.
- [x] Run tests, `tsc` and lint, then commit.

### Task 9: Renew, apply again, requirement checklist (#1, #2, #4)

**Files:**
- Create: `src/components/applications/RequirementChecklist.tsx`
- Modify: `src/components/applications/ApplicationFormDialog.tsx` (`templateApplication` prop, checklist)
- Modify: `src/components/applications/ApplicationDetailDialog.tsx` ("Förläng" and "Ansök igen" buttons)
- Modify: `src/pages/ApplicationsPage.tsx` (`?renew=1` opens a prefilled form)
- Modify: `src/pages/MyAccessPage.tsx` ("Vad krävs?" card)
- Modify: `src/services/api.ts`, `src/services/dataStore.ts`, `src/types/rbac.ts` (`renewed_from_id`)

**Interfaces:**
- Produces:
  - `<RequirementChecklist userId facilityId areaIds endDate? />`, which lists each requirement as
    uppfyllt, saknas, or "går ut före slutdatum".
  - It exports `missingRequirementIds(userId, facilityId, areaIds, endDate?): string[]`, which
    the form uses for `has_exception`.
  - `ApplicationFormDialog` gains the prop `templateApplication?: Application | null`. When it is
    set (and `editApplication` isn't), the form prefills the facility and the areas that still
    exist, sets the start date to the day after the old end date (or today, whichever is later),
    leaves the end date empty, and submits `renewed_from_id` only when the template status is
    `approved` or `expired`.
  - `canRenew(app: Application, today: Date): boolean` in `applicationRules.ts` is true for the
    applicant's own application that is approved and ends within 60 days, or expired without
    `revoked_at`.

- [x] Add `canRenew` tests to `applicationRules.test.ts`: approved, ending in 30 days → true;
  ending in 90 days → false; revoked → false; no end date → false.
- [x] Implement, add the buttons, handle the query parameter and add the MyAccess card.
- [x] Run tests, `tsc` and lint, then commit.

### Task 10: Timeline, substitutes UI, deactivation confirmation (#5, #11, #17)

**Files:**
- Create: `src/components/applications/ApplicationHistory.tsx`
- Modify: `src/components/applications/ApplicationDetailDialog.tsx`
- Modify: `src/pages/ProfilePage.tsx` ("Ersättare vid frånvaro" card for line managers)
- Modify: `src/components/users/UserFormDialog.tsx` (substitute fields)
- Modify: `src/pages/UsersPage.tsx` (confirm before deactivating, using the preview counts)
- Modify: `src/services/api.ts` and `dataStore.ts`: `getApplicationHistory`, `getManagerCandidates`, `getDeactivationPreview`
- Modify: `src/types/rbac.ts` (`substitute_*` fields on `User`)

**Interfaces:**
- Consumes the endpoints from Tasks 2, 3 and 5.
- Produces:
  - `<ApplicationHistory applicationId />`, which loads the timeline on mount in API mode and
    shows "Historik finns i serverläge" in localStorage mode.
  - The Swedish action labels in `HISTORY_LABELS`.

- [x] Implement.
- [x] Deactivation confirmation text: "Inaktivera {namn}? {n} godkända tillträden återkallas och {m} väntande ansökningar dras tillbaka."
- [x] Run `tsc` and lint, then commit.

### Task 11: Active-access page, import dialog, log page, reminder settings (#14, #19, #21, #12 UI)

**Files:**
- Create: `src/pages/FacilityAccessPage.tsx` (route `/facilities/:facilityId/access`; same `RoleGuard` as the areas page)
- Create: `src/components/users/UserImportDialog.tsx`
- Modify: `src/App.tsx`, `src/pages/FacilitiesPage.tsx` ("Aktiva tillträden (n)" link)
- Modify: `src/pages/UsersPage.tsx` ("Importera" button)
- Modify: `src/pages/LogsPage.tsx` (server search, date range, export of the filtered result)
- Modify: `src/pages/SettingsPage.tsx` (Aviseringar: "Påminn efter (dagar)" and "Eskalera efter (dagar)")
- Modify: `src/services/api.ts`, `dataStore.ts`: `importUsers(rows)` and `getLogsPage(params)`

**Interfaces:**
- Consumes `parseCsv` and `toCsv` (Task 7), `usePersistentState` (Task 8), and `POST /users/import` and `GET /logs` (Tasks 5 and 7).
- Produces:
  - `activeAccessFor(facilityId: string, today: Date): Application[]` in `applicationRules.ts`,
    which returns approved applications with `start_date ≤ today` and no `end_date` or one on or
    after today.

- [x] Add an `activeAccessFor` test case: a future start is excluded; no end date is included; an end date of today is included.
- [x] Implement:
  - **Access page:** area filter including sub-areas, search, and a CSV export with
    `toCsv`; rows expiring within 30 days are highlighted.
  - **Import dialog:** template download, preview of 10 rows, then the result table and the result
    CSV download (warning: "Lösenorden visas bara nu").
- [x] Run tests, `tsc`, lint and build, then commit.

### Task 12: End-to-end verification and docs

**Files:**
- Modify: `scripts/smoke-test.mjs` (new checks)
- Modify: `README.md` (features and settings), `CLAUDE.md` (substitutes, reminders), `roadmap.md` (log search done)

- [x] **New smoke checks:**
  - Renewal with `renewed_from_id`.
  - History returns the created, pending_facility and approved entries.
  - A substitute in range can approve, and one out of range gets 403.
  - Deactivation revokes and withdraws; a second deactivation changes nothing.
  - A manager change notifies the new manager.
  - Import gives created, skipped and error rows, and an imported user can log in with the temp
    password and must change it.
  - Log search with `q` finds a known action.
- [x] **Run on a fresh stack:**
  - `docker compose -p ag-smoke … up -d --build`, then `node scripts/smoke-test.mjs`; all pass.
  - Backdate `status_changed_at` via psql, run the expiry job twice, and confirm one reminder and one escalation.
- [x] Re-run the role-by-role UI crawl in both themes; expect 0 console errors and 0 failed requests.
- [x] Update the docs, then commit.
