# Design: 13 user improvements (2026-11-15)

## Intent

Make Access Guardian easier to use day to day and close one security gap, without changing the
core approval flow. Chosen by the owner from a list of 29 suggestions: #1, 2, 4, 5, 9, 11, 12,
14, 17, 18, 19, 21, 27.

**Goals**
- Fewer dead ends for applicants: renew, apply again, see requirements up front, follow history.
- Nothing gets stuck: approvers see what waits for them, absence is covered, stuck items escalate.
- Facility owners can answer "who has access right now?".
- Accounts that are closed stop having access.
- Admin chores get faster: bulk user import, searchable log.

**Non-goals**
- No change to who may approve what (the `TRANSITIONS` table stays as it is). The only additions
  are a substitute acting as the manager, and the deactivation side effects.
- No new external services: e-mail stays optional, and nothing is sent to third parties.
- localStorage mode (Lovable preview) gets the UI features where cheap, but server-side features
  (reminders, import, substitute rules) are API-mode only.

**Anti-goals (a failure even if it works)**
- An approver can act on something they couldn't before, other than as an active substitute.
- A deactivated user keeps any approved access.
- Users get flooded with reminder e-mails.

## Decisions made with the owner

| # | Decision |
|---|---|
| 1 | A renewal is a **new application with full approval** (manager → facility), prefilled from the old one. |
| 11 | A substitute is set **by the manager on their profile, or by an admin**. The substitute must have the line manager role. |
| 17 | Deactivating a user **revokes approved access and withdraws pending applications**. Re-activating restores nothing. |
| 19 | CSV import **generates temporary passwords** shown in a downloadable result file (no e-mail). Rows whose e-mail already exists are **skipped** and listed. |

## Approaches considered

**A. Everything client-side on the existing in-memory cache.** The fastest to build, since the
frontend already holds every application the user may see. It can't do reminders, import or
substitute permissions, which need the server.

**B. Server for rules and data, client for views (chosen).** Permissions, side effects,
reminders, import, log search and history live in the backend. Pure views ("att hantera" count,
"who has access now", requirement checklists, remembered filters) are computed from the cache
the frontend already has. This matches how the app is built today.

**C. A new "inbox" and "access" API with server-side filters for every list.** Scales best but
duplicates the cache-based data layer for little gain at this app's size. Rejected for now; it can
replace B's client-side views later without changing the UI.

## The design, per feature

### Database: migration `0008_user_improvements.sql`
- `applications.status_changed_at TIMESTAMPTZ`, backfilled from `updated_at` and updated on every
  status change. It is used by the reminders.
- `applications.reminded_at`, `applications.escalated_at` (TIMESTAMPTZ), cleared on every status change.
- `applications.renewed_from_id UUID REFERENCES applications(id) ON DELETE SET NULL`.
- `users.substitute_id UUID REFERENCES users(id) ON DELETE SET NULL`, `users.substitute_from DATE`,
  `users.substitute_to DATE`.

### #1 Renew access, and #2 apply again
- **"Förläng"** on an approved, or expired-but-not-revoked, application of your own, shown when it
  expires within 60 days or has expired.
- **"Ansök igen"** on a denied application of your own.
- Both open the application form prefilled with facility and areas. The start date is the day
  after the old end date (or today if that has passed); the end date is empty. Renewals store
  `renewed_from_id`.
- The 30/7/1-day expiry reminder links to `/applications/:id?renew=1`, which opens the prefilled
  form directly.
- The form accepts a template application (separate from "edit") and keeps the existing reset-on-open behaviour.

### #4 "What do I need?"
- The application form shows a live checklist of the requirements for the chosen facility and
  areas (fulfilled, missing, expires before the end date), instead of only a warning. The
  justification field stays required when anything is missing.
- **Min åtkomst** gets a "Vad krävs?" card: pick a facility, optionally areas, and see the same checklist.

### #5 History in the application
- `GET /api/applications/:id/history` (same view rule as the application) returns the audit-log
  entries for the application and its attachments, oldest first, with actor names.
- The detail dialog shows a vertical timeline: created, submitted, approved by name, decided,
  revoked with reason, attachments added or removed.

### #9 "Att hantera"
- One shared function `canActOn(application, user)` mirrors the transition rules. It is used by
  the detail dialog and the counter.
- A counter badge on **Ansökningar** in the sidebar shows how many applications you can act on.
- A new status option **"Att hantera (n)"** at the top of the application list filter shows only
  those, computed from the cache.

### #11 Substitute during absence
- **Profile (line managers):** "Ersättare vid frånvaro" with a substitute picker and from/to dates.
  It's saved via `PUT /api/auth/me`; an admin can set the same fields in the user form.
- **Substitute candidates:** `GET /api/users/managers` returns active users with the line manager
  role (id and name), for the picker.
- **Permission rule:** a user counts as the approving manager for an application when they are
  the applicant manager's substitute and today is within the date range. This is a single
  addition in `getApplicationAccess`; the applicant still can never approve their own application.
- **Visibility:** while active, the substitute sees the absent manager's direct reports'
  applications and names.
- **Notifications:** an application entering "väntar på chef" also notifies an active substitute.

### #12 Reminders for stuck applications
- **Settings, Aviseringar tab:** "Påminn efter (dagar)", default 3, and "Eskalera efter (dagar)",
  default 7; 0 turns either off.
- **Hourly job:**
  - Each `pending_*` application older than the reminder threshold with no `reminded_at` sends one
    reminder to its current approvers (the same recipients as when it entered the status), then
    sets `reminded_at`.
  - Older than the escalation threshold with no `escalated_at`, it notifies active administrators
    once and sets `escalated_at`.
- **No repeats:** at most one reminder and one escalation per status.

### #14 Who has access right now
- On the facility card (administrators, the owner and that facility's admins): **"Aktiva
  tillträden (n)"**, linking to `/facilities/:id/access`.
- The page lists approved applications valid today (start ≤ today ≤ end, or no end date):
  person, company, areas, valid from and to, and approved by.
- It has filters for area (including sub-areas) and free-text search, plus a CSV export.
  "Expires within 30 days" is highlighted.

### #17 Deactivation revokes access
- In `PUT /api/users/:id`, a change of `is_active` from true to false, inside the same transaction:
  - Approved applications are revoked: status `expired`, `revoked_at` and `revoked_by` set, reason
    "Kontot inaktiverat".
  - Pending applications are withdrawn: status `denied`, reason "Ansökan återkallad – kontot inaktiverat".
- **After the transaction:** owners of the affected facilities are notified, and an audit entry
  is written per application.
- **The user form shows a confirmation**, with counts, before deactivating.

### #18 Manager change
- Permission already follows the current `manager_id`. In `PUT /api/users/:id`, when
  `manager_id` changes, the new manager is notified about the user's applications in "väntar på
  chef", and an audit entry is written.

### #19 CSV import of users
- **Users page:** an "Importera" dialog with a template download, file choice and a preview of
  the first rows with any validation errors. The import runs only after confirmation.
- **CSV format:** UTF-8, `;` or `,` auto-detected (Swedish Excel saves `;`). Header row:
  `email;fornamn;efternamn;telefon;befattning;avdelning;foretag;chef_email;roller`. `roller` is
  separated by `|` and accepts the Swedish role labels or the role keys.
- **Server:** `POST /api/users/import` (admin) takes the parsed rows (max 500), validates each
  one, creates new users with generated temporary passwords and `must_change_password`, and
  resolves `chef_email` to `manager_id`, including against users created in the same file.
- **Result:** existing e-mails are skipped. The response returns per-row status: created,
  skipped (existing) or error with a reason.
- **Result file:** the dialog offers a downloadable result CSV with the temporary passwords,
  once. The passwords are never stored in plain text or logged.

### #21 Search and dates in the system log
- `GET /api/logs` gets `q` (free text over action, details and actor name), `from` and `to`
  parameters, and is paged on the server.
- The log page uses them, with a date-range picker, instead of filtering the last 1,000 entries
  in the browser.
- **Export:** exports the filtered result, up to 10,000 rows.

### #27 Remember list filters
- A small `usePersistentState(key, default)` hook keeps search, status, role and page-size
  filters per page in `sessionStorage`. They survive navigation within the tab but not a new
  session. Used on Ansökningar, Användare, Systemlogg and the new access page.

## What's left to the builder
- Exact wording of Swedish UI strings, following the existing tone.
- Visual layout of the timeline, checklist and access page, within the existing design tokens.
- The CSV parser implementation (small and dependency-free) and test cases.

## Verification
- **Backend unit tests:** substitute access rules, CSV row validation, and the reminder selection logic.
- **Smoke test:** `scripts/smoke-test.mjs` gets new checks:
  - renewal, history, and substitute approve and expiry
  - deactivation revoking and withdrawing
  - manager-change notification
  - import with existing, new and invalid rows
  - log search.
- **Reminders and escalation** are checked once against the test database: backdate
  `status_changed_at` with SQL, run `/api/admin/run-expiry-job`, and confirm exactly one reminder
  and one escalation (a second run sends nothing).
- **Browser check:** the role-by-role UI scenarios re-run in both themes.
