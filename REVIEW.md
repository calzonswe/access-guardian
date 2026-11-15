# Access Guardian — Review & fix list (2026-11-15)

How this was produced: full read of the backend (`backend/src`), the frontend data layer (`src/services`, `src/context`) and the pages/dialogs that drive the application workflow; plus `npm outdated`, `npm audit`, `npm run build`, `npm run lint`, `npm run test` and `tsc` in a clean copy of the repo. The backend was **not** run against a database (Docker daemon was not running), so backend findings are from code reading — each one cites the exact lines.

Priority legend: **P0** = app is broken for normal use · **P1** = security/authorization or data-loss bug · **P2** = wrong behaviour / UI–backend mismatch · **P3** = quality/maintenance.

The decisions that settle the open questions are in [section 3](#3-decisions-answered-2026-11-15).

## Status (updated 2026-11-15)

**Fixed on `main`:** P0 #1–#7, P1 #8–#21, P2 #22–#38, P3 #39 (0 lint errors), #42, #43; dependency phases A and B. Two more bugs found while fixing are also fixed: assigning facility admins never worked (the UI sent `admin_ids` to a PUT that ignores it), and the user form could not clear a manager once the backend stopped wiping fields it didn't receive.

**Verified:** `npm ci` in both packages, `npm run build`, `tsc`, `npm run lint`, frontend vitest (5 tests), backend `node:test` (8 tests on the transition rules). **Not yet verified at runtime:** the backend has not been run against PostgreSQL; migration 0006 and the route changes still need a smoke test with `docker compose up`.

**Still open:**
- #40 (partly done): there are no route-level authorization tests against a real database.
- #41: every mutation still re-fetches all collections.
- #44: login lockout is per e-mail only.
- `nodemailer` 8 has a high advisory, fixed only in v10 (major). The app doesn't pass user-controlled `raw` options, so exposure is low.
- `react-router-dom` 6.x has a moderate advisory, fixed only in v7 (deferred with the other Phase C majors).
- Remaining dev-only advisories (vitest/tinypool, the Vite dev server, eslint tooling) need the Phase C majors.

---

## 1. Dependencies

### 1.1 Current state

| Check | Result |
|---|---|
| `npm ci` (frontend) | **Fails** — `package-lock.json` is out of sync with `package.json` (missing `@playwright/test`, `vitest`, `jsdom`, `@testing-library/*`). The Dockerfile hides this with `npm ci \|\| npm install`, so builds are not reproducible. |
| Lockfiles | Three competing lockfiles: `package-lock.json`, `bun.lock`, `bun.lockb` (frontend) and `package-lock.json` + `bun.lock` (backend). |
| `npm audit` frontend | 14 vulnerabilities (12 high, 2 moderate): `@remix-run/router` (react-router), `zod`, `rollup`, `postcss`, `esbuild`, `nanoid`, `lodash`, `glob`, `minimatch`, … |
| `npm audit` backend | 5 vulnerabilities (**1 critical**, 3 high, 1 moderate): `proxy-addr` (critical, IP spoofing — relevant because `trust proxy` is on), `multer`, `nodemailer`, `body-parser`, `qs`. All fixable without breaking changes (`npm audit fix`). |
| Node runtime | Both Dockerfiles use `node:20-alpine`. Node 20 reached end-of-life in April 2026 — move to the current LTS line. |
| Browserslist data | 17 months old (`npx update-browserslist-db@latest`). |

### 1.2 Version table

Frontend — runtime dependencies (only those not already on latest):

| Package | In package.json | Latest | Notes |
|---|---|---|---|
| react / react-dom | ^18.3.1 | 19.3.1 | Major. shadcn components are React-19 compatible; `forwardRef` still works. Bump `@types/react*` to 19 together. |
| react-router-dom | ^6.30.1 | 7.18.5 | Major, **has a high-severity advisory on the 6.x line**. v7 keeps the `BrowserRouter`/`Routes` API used here; package can be switched to `react-router`. |
| @tanstack/react-query | ^5.83.0 | 5.107.1 | Minor. (Effectively unused — only the provider.) |
| zod | ^3.25.76 | 4.6.7 | Major, high advisory on <4.6.6. **Not imported anywhere outside `components/ui`** → remove or bump. |
| @hookform/resolvers | ^3.10.0 | 7.0.6 | Unused outside `components/ui/form.tsx` → remove. |
| react-hook-form | ^7.61.1 | 7.92.0 | Unused outside `components/ui/form.tsx` → remove. |
| date-fns | ^3.6.0 | 4.4.0 | Only used by `ui/calendar.tsx` (unused) → remove. |
| react-day-picker | ^8.10.1 | 10.0.2 | Only `ui/calendar.tsx` (unused); v10 breaks the shadcn v8 calendar → remove. |
| recharts | ^2.15.4 | 3.10.1 | Only `ui/chart.tsx` (unused) → remove. |
| lucide-react | ^0.462.0 | 1.73.0 | Major (icon renames possible) — used everywhere, bump and fix any renamed icons at build time. |
| sonner | ^1.7.4 | 2.0.8 | Major, used for toasts. |
| next-themes | ^0.3.0 | 0.4.6 | Used by `ui/sonner.tsx`. |
| tailwind-merge | ^2.6.0 | 3.7.0 | v3 requires Tailwind 4 → bump together with Tailwind. |
| react-resizable-panels | ^2.1.9 | 4.23.0 | Only `ui/resizable.tsx` (unused) → remove. |
| vaul | ^0.9.9 | 1.1.2 | Only `ui/drawer.tsx` (unused) → remove. |
| embla-carousel-react, input-otp, cmdk | — | — | Only used by unused `ui/` components → remove. |
| @radix-ui/* | various | patch/minor newer | Safe bumps. |

Frontend — dev dependencies:

| Package | In package.json | Latest | Notes |
|---|---|---|---|
| vite | ^5.4.19 | 8.3.8 | Major ×3. Needs Node ≥20.19/22.12. `lovable-tagger` supports `vite <9`. |
| @vitejs/plugin-react-swc | ^3.11.0 | 4.3.3 | Required for Vite 6+. |
| vitest | ^3.2.4 | 5.1.0 | Needs Vite ≥6.4. |
| tailwindcss | ^3.4.17 | 4.3.5 | **Biggest migration**: CSS-first config, `tailwind.config.ts` → `@theme`, `tailwindcss-animate` → `tw-animate-css`, `postcss`/`autoprefixer` replaced by `@tailwindcss/vite`. Use the official upgrade tool. |
| typescript | ^5.8.3 | 7.0.2 | **Stop at 6.0.x**: `typescript-eslint@8.72` only supports TS `<6.1`. |
| eslint / @eslint/js | ^9.32.0 | 10.x | Major. `eslint-plugin-react-hooks` 7 and `react-refresh` 0.5 support it. |
| eslint-plugin-react-hooks | ^5.2.0 | 7.1.1 | Adds React-Compiler rules; expect new warnings. |
| globals | ^15.15.0 | 17.14.0 | |
| jsdom | ^20.0.3 | 31.0.1 | |
| @testing-library/jest-dom | ^6.6.0 | 7.0.1 | |
| @types/node | ^22.16.5 | match the Node LTS you deploy | |
| lovable-tagger, postcss, autoprefixer, typescript-eslint, @playwright/test, @testing-library/react, @tailwindcss/typography | | minor/patch newer | Safe bumps. |

Backend:

| Package | In package.json | Latest | Notes |
|---|---|---|---|
| express | ^4.21.0 | 5.3.0 | Major. Code changes required: `req.body` is `undefined` when no body was parsed — `requireFacilityAccess`/`requireAreaAccess` read `req.body[...]` and would throw on GET (`backend/src/middleware/rbac.js:87,113`); async errors now reach the error handler; path-pattern syntax changes (none of the current routes use wildcards). |
| bcryptjs | ^2.4.3 | 3.0.3 | Major (ESM, `$2b$` hashes). Existing `$2a$` hashes still verify. |
| nodemailer | ^8.0.11 | 10.5.0 | Major, current line has an advisory. |
| multer | ^2.1.1 | 2.5.0 | Security fix. |
| pg | ^8.13.0 | 8.23.1 | Minor. |
| cors, jsonwebtoken | | patch | Safe. |

### 1.3 Upgrade plan

1. **Phase A — no breaking changes (do first):** pick one package manager (see Q4) and delete the other lockfiles; regenerate the lockfile; `npm audit fix` in both packages; bump all minor/patch versions; Dockerfiles → current Node LTS and plain `npm ci`; update browserslist DB.
2. **Phase B — remove dead weight:** delete unused `src/components/ui/*` files (calendar, chart, carousel, drawer, input-otp, command, resizable, menubar, context-menu, navigation-menu, hover-card, slider, aspect-ratio, toggle-group, form, accordion, radio-group) and their packages (`zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `react-day-picker`, `recharts`, `embla-carousel-react`, `vaul`, `input-otp`, `cmdk`, `react-resizable-panels` and the matching `@radix-ui/*`). This removes most of the risky majors instead of migrating them. Check with Lovable first if you add components there regularly.
3. **Phase C — majors, one PR each, build + smoke test between:** Vite 8 + plugin-react-swc 4 + Vitest 5 → React 19 → react-router 7 → lucide/sonner → ESLint 10 + TS 6 → Tailwind 4 (+ tailwind-merge 3) → backend Express 5 (with the `req.body` fixes above) + bcryptjs 3 + nodemailer 10.

---

## 2. Fix list

### P0 — the app is broken for normal use

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | `.gitignore:7`, `src/pages/LogsPage.tsx:12` | **Production build fails**: `LogsPage` imports `@/components/logs/LogAnalysisPanel`, which is not in the repo. The `.gitignore` entry `logs` also matches the folder `src/components/logs/`, so the component was never committed. `npm run build` and the Docker image build both fail. | Change `logs` to `/logs/` (or remove it — `*.log` already covers log files), then recover `LogAnalysisPanel.tsx` from Lovable or write it (API already exists: `api.analyzeLogs`, `/api/logs/analyze`), and commit. |
| 2 | `src/services/dataStore.ts:56-68` (`loadFromApi`) | **Every non-admin user sees an empty app.** All 11 collections are fetched with one `Promise.all`, including `api.getLogs()`. `/api/logs` is admin-only (`backend/src/routes/logs.js:7`), so it returns 403 for everyone else, the whole `Promise.all` rejects, the error is only logged, and users/facilities/applications/etc. all stay empty. | Only fetch logs when the user is an administrator (and only when the logs page needs them); use `Promise.allSettled` so one failing collection doesn't wipe the others. |
| 3 | `backend/src/routes/applications.js:241-243`, `src/components/applications/ApplicationFormDialog.tsx:141-144` | **New applications never enter the workflow.** The form creates with `status: 'pending_manager'`, but the backend forces every new application to `draft`. There is no "submit" button anywhere in the UI that moves a draft to `pending_manager`, so managers never see anything to approve. (Works in localStorage mode only, which hides the bug in Lovable preview.) | Allow the applicant to create directly as `pending_manager` (keep forcing `draft` only for privileged statuses), **or** add a "Skicka in" action for drafts that does `PUT {status:'pending_manager'}`. Either way, the backend must check that only the applicant (or an admin) may submit. |
| 4 | `backend/src/routes/areas.js:64`, `facilityRequirements.js:37`, `areaRequirements.js:37` | **Applicants can't select areas, and requirement checks never trigger.** For `employee`, `contractor` and `line_manager` these endpoints return `[]`. The application form therefore shows no areas, and `hasMissingReqs` (`ApplicationFormDialog.tsx:96`) is always false, so the exception (avsteg) path is never used. Managers also see no area names in `ApplicationDetailDialog`. | Give all authenticated users read access to areas and facility/area requirement links (or at least per `facility_id`). Write operations stay restricted. |
| 5 | `ApplicationDetailDialog.tsx:46-50, 64-65` vs `applications.js:329-334` | **Applications with an exception get stuck.** When a manager approves an application that has an exception, the frontend sends `pending_exception`. The backend only allows that transition from `pending_facility` by the applicant, so the manager gets 403. Also: the frontend shows the approve button for exceptions to `facility_owner`, but the backend only lets `administrator` approve exceptions. | Per decision Q1: manager approval with an exception → `pending_exception` (allowed for the approving manager), then the **owner of that facility** approves. Make the backend and the frontend both follow this (see section 3). |
| 6 | `src/pages/ProfilePage.tsx:53`, `backend/src/routes/users.js:234` | **Profile editing fails for every non-admin.** The profile page calls `PUT /api/users/:id`, which is admin-only → "Kunde inte spara profil". | Add a self-service endpoint (e.g. `PUT /api/auth/me`) that accepts only `full_name`, `first_name`, `last_name`, `phone`, `title`, `department`. |
| 7 | 15 calls to `store.addLog(...)` in: `ApplicationDetailDialog.tsx:77,89,101`, `ApplicationFormDialog.tsx:148`, `ApplicationsPage.tsx:118`, `TeamPage.tsx:57`, `FacilitiesPage.tsx:68,72,82,124`, `AreasPage.tsx:98`, `RequirementsPage.tsx:64`, `SettingsPage.tsx:125`, `UserFormDialog.tsx:111,130`, `UserRequirementDialog.tsx:75` | **Error toasts after successful actions.** After an approval, denial, revocation, etc. the frontend also posts its own audit entry to `POST /api/logs`, which is admin-only. For line managers, facility owners and employees this returns 403. Where it's awaited, the user sees an error even though the action succeeded; where it isn't, the promise rejection is unhandled. For admins every action is logged twice, because the backend already calls `audit()`. One deletion is even logged as `application_denied` (`ApplicationsPage.tsx:118`). | In API mode, skip client-side logging entirely (make `store.addLog` a no-op when `isApiMode()`), and remove `POST /api/logs` from the backend unless something else needs it. |

### P1 — security, authorization and data-loss

| # | Where | Problem | Fix |
|---|---|---|---|
| 8 | `backend/src/routes/applications.js:266-371` | **Any logged-in user can modify any application.** The `PUT` only checks permissions for some status values. With no `status` (or with `status:'expired'`, or any value not listed) there is no ownership check at all: anyone can change `start_date`/`end_date`/`area_ids` (e.g. extend approved access), set `has_exception`, overwrite `denied_reason`, or revoke anyone's access. Unknown status strings cause a 500. | Validate `status` against the enum. Define allowed transitions explicitly (from → to → who). Allow field edits only by the applicant while in `draft`/`pending_manager` (or by an admin). Allow `approved → expired` (revocation) only for admin or staff of *that* facility. |
| 9 | `applications.js:285-288, 318-320` | **Self- and peer-approval.** "Manager" is computed as `applicantId === me` or `teamIds.has(me)`, where `teamIds` = everyone under the applicant's manager. So a line manager can approve their own application, and any line-manager colleague under the same boss can approve it too. `draft → pending_facility` is also allowed, skipping submission. | The approver must be the applicant's manager (`scope.managerId === me`, or the applicant is in `getManagedUserIds(me)`) or their sponsor, never the applicant. Only allow it from `pending_manager`. |
| 10 | `applications.js:322` | Denying at `pending_facility` checks only the role, not the facility: any facility owner/admin can deny applications for facilities they don't manage. | Add `isFacilityAdminOrOwner(me, scope.facilityId)`. |
| 11 | `applications.js:207`, `attachments.js:39,41,159` | **Information leak.** Viewing an application or downloading its attachments is allowed for anyone in `teamIds` (all colleagues under the same manager), and attachment download is allowed for every facility owner/admin regardless of facility. | Use the same "applicant / their manager / sponsor / staff of that facility / admin" rule for viewing and downloading. |
| 12 | `backend/src/routes/userRequirements.js:35, 89-95, 108-134` | **Employees can certify their own requirements.** `canModifyOwner` returns true for the owner, so any user can `PUT /api/user-requirements/:id {status:'fulfilled', expires_at:'2099-01-01'}`. A line manager can also create fulfilled requirements for themselves (`user_id === me` passes). Facility owners/admins can create/modify requirements for any user in the system. | Owners may only upload attachments (evidence). Only administrators may set `status`, `fulfilled_at` or `expires_at` (per decision Q2). |
| 13 | `backend/src/middleware/auth.js:26-40` | **Deactivated users keep access** until their token expires: `is_active` is not checked. `must_change_password` is enforced only by the frontend, so the API works without changing the password. A password change or reset doesn't invalidate existing tokens. | In `authMiddleware`, load `is_active`, `must_change_password` and a `token_version` (or `password_changed_at`) column, and reject tokens issued before the last change. While `must_change_password` is set, allow only `/auth/change-password` and `/auth/me`. |
| 14 | `backend/src/routes/contractor.js:137-141, 221-227` | **An anonymous visitor can create applications in an existing user's name** (any email, including employees and admins) via the public form. The different response for existing vs. new emails also reveals which addresses have accounts. For a real existing contractor, the sponsor named in the form gets the notification but **cannot approve**, because approval checks the user's stored `contact_person_id`, which isn't updated. | If the email already exists, don't create the application; tell the user to log in and apply from inside the app. Return the same response either way (send account details by email instead). |
| 15 | `backend/src/routes/facilities.js:86-96` | A `facility_admin` can change `owner_id` (e.g. make themselves owner): `requireFacilityAccess` lets admins through, and `owner_id` is accepted from the body. | Allow `owner_id` changes only for administrators (and possibly the current owner). |
| 16 | `applications.js:25`, `jobs/expiryJob.js` (`notifyOnce`), `users.js:215`, `auth.js:166` | **HTML injection in emails.** User-controlled text (`denied_reason`, `full_name` — which comes from the public contractor form) is placed into the email HTML without escaping. | Run all interpolated values through `htmlEscape` (already in `services/email.js:59`), or pass plain `text` instead of `body`. |
| 17 | `backend/src/routes/auth.js:99-110` | `change-password` doesn't ask for the current password, so a stolen or forgotten-open session can take over the account. | Require `currentPassword` (except while `must_change_password` is set). |
| 18 | `backend/src/db.js:42-45` | The initial admin is re-created on **every startup** whenever no user has the `INITIAL_ADMIN_EMAIL` address — e.g. after the admin changes their email or deletes that account. Each time, a new administrator account appears and its password is printed to the logs. | Seed only when no user has the `administrator` role. |
| 19 | `backend/src/routes/users.js:264-265` | **Data loss**: every admin `PUT /users/:id` sets `manager_id` and `contact_person_id` to `NULL` unless both are sent. Toggling a user active/inactive (`UsersPage.tsx:73`) erases their manager and sponsor, which then breaks approvals and team views. | `if (manager_id !== undefined) addField('manager_id', manager_id \|\| null)`, and the same for `contact_person_id`. |
| 20 | `backend/src/routes/users.js:173-175` | `POST /users` returns 400 after `BEGIN` without `ROLLBACK`, putting the connection back into the pool mid-transaction. Unknown roles cause a 500 (no validation against `VALID_ROLES`). A duplicate email on `PUT` causes a 500 instead of 409. Nothing stops an admin from removing their own administrator role, or the last admin from being deactivated. | Validate before `BEGIN` (or roll back), validate roles, map `users_email_key` to 409 on PUT, and block removing or deactivating the last administrator. |
| 21 | `db/init.sql:183,115,76-77,222`, `users.js:320` | **Most users can't be deleted**: `applications.applicant_id`, `facilities.owner_id`, `users.manager_id`/`contact_person_id` and `system_logs.actor_id` have no `ON DELETE` rule. Every login writes a log row with `actor_id`, so deleting anyone who has ever logged in fails with "Internt serverfel". | Add a migration: `system_logs.actor_id` and `manager_id`/`contact_person_id` → `ON DELETE SET NULL`. For applicants and facility owners, either block deletion with a clear 409 message or prefer deactivation (soft delete). |

### P2 — wrong behaviour and frontend/backend mismatches

| # | Where | Problem | Fix |
|---|---|---|---|
| 22 | `applications.js:212-224, 431-442` | `GET /applications/:id` and the `PUT` response use non-`DISTINCT` aggregation over two `LEFT JOIN`s. With N areas and M attachments, `area_ids` contains each area M times and each attachment appears N times. (The list endpoint uses `DISTINCT` and is fine.) | Reuse `APP_SELECT` with `WHERE a.id = $1 GROUP BY a.id`. |
| 23 | `facilities.js:93-95`, `areas.js:121-124` | `PUT` always writes `name`, `description`, `address` / `security_level`. Omitting a field sets it to `NULL` (or causes a 500 on `NOT NULL` columns). | Build the update from the fields that are present, as `users.js` does. |
| 24 | `applications.js:375-390`, `src/services/notifications.ts` | **Managers are never notified of new applications.** The backend only notifies the applicant on `pending_manager`. The frontend's attempt to notify the manager is rejected by `canNotify` (an employee can't notify their manager). | Notify `scope.managerId` / `contactPersonId` server-side when an application enters `pending_manager`. |
| 25 | `src/services/notifications.ts` (whole file) | In API mode the frontend creates the same notifications the backend already creates (duplicates). It shows a fake "📧 E-post skickad till …" toast whether or not email is configured, and `createNotification` rejections (403 from `canNotify`) are unhandled. | Make `notifyApplicationStatusChange` a no-op in API mode (keep it for localStorage mode only). |
| 26 | Backend notification links (`/applications/${id}`), `src/App.tsx:66`, `AppHeader.tsx:75` | Clicking a notification opens `/applications/<id>`, which doesn't exist as a route → NotFound page. | Add a `/applications/:id` route (or `?id=` param) that opens `ApplicationDetailDialog`. |
| 27 | `auth.js:82-85`, `AuthContext.tsx` | **Active users are logged out after 30 minutes**: the JWT's lifetime is the idle timeout and is never refreshed, so the session ends even while the user is working (the next request gets 401). | Add a sliding refresh (e.g. `POST /auth/refresh` called on activity), or issue a longer absolute lifetime and keep the idle timeout client-side. |
| 28 | `src/context/BrandingContext.tsx:62`, `backend/src/routes/settings.js:9` | **Custom branding is only visible to admins.** Branding is loaded from `GET /settings` (admin-only), once, before login. Non-admins and the login page always show the defaults. | Add a public `GET /api/settings/branding` (branding only) and re-load after login. |
| 29 | `src/services/dataStore.ts:37-49` | If `/api/health` fails in production (backend restarting, DB down → 503), the frontend silently switches to **localStorage mode** with a local admin `admin@company.local` / `Admin123!`. Anything users create is stored only in their browser. | Use localStorage mode only when explicitly enabled (e.g. `import.meta.env.DEV` or `VITE_LOCAL_MODE=true`). Otherwise show a "server unavailable" message. |
| 30 | `auth.js:15,161`, `users.js:210` | When `APP_BASE_URL` is empty (the default), password-reset and welcome emails contain a relative link (`/reset-password?token=…`) that doesn't work from an email client. | Require `APP_BASE_URL` when SMTP is enabled (warn at startup), or derive it from the request origin. |
| 31 | `ApplicationFormDialog.tsx:128-150` | Editing an application calls `store.updateApplication(...)` without `await`, shows "Ansökan uppdaterad" regardless, and leaves errors unhandled. The backend `PUT` ignores `facility_id`, so changing the facility silently does nothing. Creating has no `try/catch` either. | `await` inside `try/catch`. Either support `facility_id` in the `PUT` (while in draft) or disable the facility selector when editing. |
| 32 | `ApplicationDetailDialog.tsx:52` vs `applications.js:461` | Edit/delete buttons appear for `pending_manager`, but the backend only deletes `draft`/`denied` → error. | Align: either allow deleting (withdrawing) `pending_manager`, or hide the delete button for that status. |
| 33 | `ApplicationFormDialog.tsx:154-163` | In localStorage mode, attachments are still uploaded to the API → always fails with an error toast. | Skip uploads (or store them locally) when not in API mode. |
| 34 | `RequirementsPage.tsx:77`, `FacilitiesPage.tsx:139`, `TeamPage.tsx:51-62` | The UI offers actions the backend forbids: facility owners/admins see "Nytt krav" (backend: admin-only), facility owners see "create facility" (admin-only), line managers can edit/delete team members (admin-only). Each ends in a 403. | Per decision Q2 the backend is right: hide these actions in the UI for non-admins. |
| 35 | `ApplicationDetailDialog.tsx:46-50, 174` | Admins see "Godkänn"/"Neka" on `draft`, `denied` and `expired` applications; approving those does nothing or returns an error. | Show the actions only for `pending_*` statuses. |
| 36 | `AuthContext.tsx:110-113`, `ProfilePage.tsx` | The password rules are hard-coded in the frontend (8 characters, all character classes) instead of using the configurable policy from `GET /auth/password-policy`. If an admin changes the policy, the frontend and backend disagree. | Fetch and use the server policy. |
| 37 | `auth.js:197-216` | Password reset checks and consumes the token in two separate statements, so the same link can be used twice in parallel. A successful reset also doesn't clear the login lockout. | `UPDATE password_reset_tokens SET used_at = now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, then call `recordSuccess`. |
| 38 | `applications.js:271` (`getApplicationScope` uses `pool`, not the transaction client) | Status changes aren't locked: two approvers acting at the same moment can both pass the checks, giving double approvals and double notifications. | `SELECT … FOR UPDATE` on the application row inside the transaction. |

### P3 — quality and maintenance

| # | Where | Problem | Fix |
|---|---|---|---|
| 39 | `npm run lint` | Fails with 23 errors / 13 warnings (`no-explicit-any` in `catch (err: any)`, `prefer-const` in `BrandingContext`, `require()` in `tailwind.config.ts`, hook dependency warnings in `ApplicationsPage`). | Fix them, or downgrade `no-explicit-any` to a warning to match the relaxed TS config (ask Lovable conventions first). |
| 40 | `npm run test` | Exits with code 1, "No test files found". `AGENTS.md` refers to `vitest.config.ts`, `playwright.config.ts`, `playwright-fixture.ts` and `src/test/setup.ts`, none of which exist. | Add a vitest config (jsdom, `@` alias, `passWithNoTests`), and backend authorization tests for items 8–12. Update `AGENTS.md`. |
| 41 | `dataStore.ts` (`refreshAll`, every mutation) | Every action re-downloads all 11 collections (users, all applications, logs, …), and paged pages also load the full lists. This gets slow as data grows. | Refresh only the affected collection; longer term, move pages to React Query (already installed) per endpoint. |
| 42 | `README.md:38,152,246` | Says the default admin password is `Admin123!`, but the backend generates a random one and prints it to the log (unless `INITIAL_ADMIN_PASSWORD` is set). | Update the docs. |
| 43 | `contractor.js:195` | Files are written to disk before the transaction commits; on a rollback they're left behind as orphans. | Write files after `COMMIT`, or delete them in the error path. |
| 44 | `services/loginAttempts.js` | Lockout is per email only, so anyone can lock out any account (including the admin) by sending wrong passwords. | Combine per-IP and per-email limits, or use exponential backoff instead of a hard lock. |

---

## 3. Decisions (answered 2026-11-15)

- **Q1 — Exceptions are approved by the facility owner.** Flow: manager approves an application that has an exception → `pending_exception` → the **owner of that facility** approves (or denies). Fix for #5: in `applications.js`, allow the approving manager to move `pending_manager → pending_exception`, and allow `pending_exception → approved/denied` for `facility_owner` where `facilities.owner_id = me` (and administrators). The frontend check in `ApplicationDetailDialog.tsx:49` must also check that it is the owner of *this* facility. Update `AGENTS.md` and `TECHNICAL.md`, which currently say administrator.
- **Q2 — The backend is right: these actions stay admin-only.** Fix for #34: hide "Nytt krav" for non-admins (`RequirementsPage.tsx:77`), hide "create facility" for facility owners (`FacilitiesPage.tsx:139`), and remove edit/delete for team members from `TeamPage.tsx` (keep it read-only for line managers). For #12, certifying requirements (`status`, `fulfilled_at`, `expires_at`) should likewise be limited to administrators; owners can only upload evidence.
- **Q3 — Upgrade scope: Phase A + Phase B only.** The Phase C majors (React 19, Vite 8, Tailwind 4, Express 5, etc.) stay deferred. Note: the `react-router-dom` 6.x advisory is only fully fixed in 7.x; check `npm audit` after Phase A to see whether 6.30.x patches it.
- **Q4 — npm.** Keep `package-lock.json` in both packages; delete `bun.lock`, `bun.lockb` and `backend/bun.lock`; make the Dockerfiles use plain `npm ci`. Lovable may regenerate `bun.lock` when you edit there; delete it again or add it to `.gitignore`.

## 4. Suggested order of work

1. P0 #1 (build) → #2 (data loading) → #7 (client logging) → #3 + #4 (application workflow) → #5 (exceptions, per Q1) → #6 (profile).
2. P1 #8–#13 and #19 (authorization holes and manager data loss); add backend tests as you go.
3. Dependency Phase A (security advisories, including the critical `proxy-addr`) and Phase B (remove unused packages).
4. The rest of P1, then P2 (including #34 per Q2), then P3.
