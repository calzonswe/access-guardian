# Access Guardian: role-by-role UI test (2026-11-15)

**How it was tested:** the full Docker stack (current `main`, commit `9d8380b`) on a fresh database, seeded with one user per role, two facilities with nested areas, requirements, and applications in every status. A headless browser (Playwright) then logged in as each role:
1. Visited every page in the sidebar, plus routes the role should not reach.
2. Clicked through the real tasks: create, edit, submit, approve, deny, decide exceptions, revoke, profile, settings, user admin, the public forms.

Console errors, failed API calls and screenshots were recorded at every step.

Roles tested: administrator, facility owner, facility admin, line manager (also employee), employee, contractor (created through the public form), and a new user with a forced password change.

Priority: **P1** = breaks normal use or misleads about security · **P2** = wrong or confusing behaviour · **P3** = polish.

## Status (updated 2026-11-15)

**Fixed on `main`:** all items except #19, which is only partly done (see below). Verified on a rebuilt stack with a fresh database:
- **API smoke test:** `scripts/smoke-test.mjs` passes all 82 checks.
- **Back-to-back crawl:** all six roles ran without backend restarts, with 0 × 429, 0 failed API calls and 0 console errors.
- **Re-run UI scenarios:**
  - The edit form is prefilled, and a new form starts clean.
  - Dates show as `YYYY-MM-DD` everywhere.
  - Revoking requires a reason and shows "Återkallad … av …".
  - The owner can assign facility admins.
  - Facility admins can manage areas.
  - The team page shows real requirement counts.
  - Manager toasts say where the application went.
  - The self-registration switch turns the public form off (403) and on.
  - Other people's drafts are hidden.

**Correction to #7:** the expiry-warning toggles did work; the settings page converts them to `expiryWarningDays` when saving. The real bug was narrower: turning all three off fell back to 30/7/1 days. That is now fixed.

**#19 (partly done):** nothing loads during a forced password change after a fresh login. Reloading the page during a forced change still sends one round of requests that return 403 (harmless).

**Behaviour changes to know about:**
- Migration `0007` adds the revocation columns.
- Backend logs are JSON in Docker (`NODE_ENV=production`).
- The Krav tab in Settings is gone; requirements are managed on the Krav page.

---

## P1: breaks normal use

| # | Role(s) | What happens | Where | Fix |
|---|---|---|---|---|
| 1 | Everyone | **Users get logged out after normal browsing.** The general API rate limit runs before authentication, so it counts per IP address, not per user: everyone behind one office network shares 600 requests per minute. One page view costs about 25 requests (all 11 collections, often fetched twice, plus `/auth/me`, branding and health). In testing, one user hit `429` after about 15 page loads. When `/auth/me` gets a 429 during a page load, `AuthContext` treats it as an invalid session and deletes the token, so the user lands on the login page. | `backend/src/index.js` (limiter on `/api/` before `authMiddleware`), `backend/src/middleware/rateLimit.js:59`, `src/context/AuthContext.tsx` (init `catch` → `setToken(null)`), `src/hooks/useDataRefresh.ts` | Key the limiter on the user id from the JWT (decode it in the key function), or apply it after auth. Clear the token only on `401`, never on 429/5xx. Stop re-fetching every collection on every page mount. |
| 2 | Employee, contractor | **Editing an application opens an empty form.** No facility and no dates (`EDIT date values: ["",""]`), and saving is blocked with "Välj en anläggning", so editing is impossible in practice. The form state is set from `editApplication` only on first mount, and the dialog stays mounted. Dates also arrive as `2027-01-10T00:00:00.000Z`, which a date input can't show. | `src/components/applications/ApplicationFormDialog.tsx:30-37` | Reset state from `editApplication` whenever the dialog opens (`useEffect` on `open`/`editApplication`); cut dates to `YYYY-MM-DD`. |
| 3 | Employee, contractor | **Attachments leak into the next form.** After closing the edit form, "Ny ansökan" lists the *other* application's attachment (`intyg.pdf`), and its ✕ button calls `deleteAttachment` on that application. | Same file (`existingAttachments` state); `ApplicationsPage.tsx` never clears `editApp` | Reset all state on open/close and set `editApp` to `null` when the dialog closes. |
| 4 | Line manager | **The team page shows "Uppfyllda krav 0 / 2" for every member.** Erik has a fulfilled requirement. `GET /user-requirements` without `user_id` returns only the manager's own requirements, so team members' requirements never load. | `backend/src/routes/userRequirements.js:56-66`, `src/pages/TeamPage.tsx` | For line managers, return requirements for themselves and everyone they manage or sponsor. |
| 5 | Facility owner | **The owner can't assign admins to their own facility.** The "Tilldela administratörer" dialog says "Inga användare med rollen Anläggningsadministratör finns", even though such users exist (the backend allows owners to assign them). The owner simply can't see those users. | `src/pages/FacilitiesPage.tsx:128` (candidates from `store.getUsers()`), `backend/src/routes/users.js` (owner scope) | Add an endpoint that lists users with the `facility_admin` role (id and name only) for owners, or include them in the owner's user scope. |
| 6 | Facility admin | **Facility admins can't manage areas from the UI.** The backend lets them create, edit and delete areas in their facility, but the facility card shows no areas link or button (only for administrators and the owner). The page only works by typing the URL. | `src/pages/FacilitiesPage.tsx:192` | Show "Hantera områden" to admins of that facility too. |
| 7 | Administrator | **Several settings switches do nothing:**<br>• "Tillåt självregistrering för entreprenörer" (off by default): the public contractor form is always open.<br>• Expiry warnings 30/7/1 days: the UI saves `warning30/7/1`, but the job reads `expiryWarningDays`.<br>• "E-post aktiverad": email depends only on the SMTP environment variables.<br>• "Lokal inloggning": ignored.<br>Meanwhile the settings the backend *does* read (session timeout, max login attempts, lockout duration, password policy) have no controls at all. | `src/pages/SettingsPage.tsx`, `backend/src/routes/contractor.js`, `backend/src/jobs/expiryJob.js:43`, `backend/src/services/settings.js` | Enforce `selfRegistration` in `/api/contractor/*` and hide the login-page link when it's off. Map the warning toggles to `expiryWarningDays`. Remove or mark "Kommer snart" on switches that aren't implemented. Add controls for `security` and `passwordPolicy`. |

## P2: wrong or confusing behaviour

| # | Role(s) | What happens | Where | Fix |
|---|---|---|---|---|
| 8 | Everyone | **Dates are shown as raw timestamps**, e.g. `2026-12-01T00:00:00.000Z`, in every application table, the detail dialog, Min åtkomst and the dashboards. | Backend returns `DATE` columns as JS `Date`; frontend prints the string as-is | Register a `pg` type parser for `DATE` (OID 1082) that returns the plain `YYYY-MM-DD` string, and format dates in one helper (`sv-SE`). |
| 9 | Facility owner, facility admin | **Names are missing on the facility card.** The owner sees "Administratörer: Inga" although Frida is the admin; the facility admin sees "Ägare: –". Names are looked up in `/api/users`, which those roles can't fully see. | `src/pages/FacilitiesPage.tsx` | Return `owner_name` and admin names with `/api/facilities`. |
| 10 | Facility admin | The dashboard shows an "Avsteg som kräver godkännande" (exceptions awaiting approval) table and lists the exception application under "Ansökningar att granska", but only the facility owner can decide exceptions. Opening it shows no buttons. | `src/pages/Dashboard.tsx` | Show the exception section to the facility owner only; label it "väntar på ägaren" for facility admins. |
| 11 | Facility owner, facility admin | Opening the areas page of a facility you don't manage (via URL) shows "Skapa en anläggning först" and a working "Nytt område" button. | `src/pages/AreasPage.tsx` | Show "Anläggningen hittades inte / ingen åtkomst" and hide the actions. |
| 12 | Line manager | Approving an application with an exception shows the toast "Ansökan godkänd", but it was only forwarded to the facility owner. The same applies to a normal manager approval (forwarded to the facility). | `ApplicationDetailDialog.tsx` (`handleApprove`) | Use status-specific messages, e.g. "Godkänd – skickad till anläggningen / anläggningsägaren för beslut". |
| 13 | Administrator | **Any text is accepted as a logo URL**, and it then shows as a broken image in the sidebar and on the login page. | `SettingsPage.tsx` (Branding), `AppSidebar`, `LoginPage` | Validate `http(s)://` URLs on save, and fall back to the default icon on image error (`onError`). |
| 14 | Administrator | A requirement can be saved with "Har giltighetstid" checked but no number of days; the list then shows " dagar". | `backend/src/routes/requirements.js`, `RequirementsPage.tsx` | Require `validity_days > 0` when `has_expiry` is set. |
| 15 | Line manager | The manager's application list includes team members' **drafts** (unsubmitted). | `backend/src/routes/applications.js` (list scope) | Exclude other people's drafts from managers' and facility staff's lists. |
| 16 | All (profile) | "Kravuppfyllnad 0 / 2" lists *every* requirement in the system for every role, including administrators and facility owners who never apply. | `src/pages/ProfilePage.tsx` | Show only requirements relevant to the user (facilities they applied to), or hide the section for roles that don't apply. |
| 17 | Everyone | A revoked application and an expired one look the same ("Utgången" in the list), and revoking takes no reason. | `ApplicationTable`, `ApplicationDetailDialog.tsx` | Distinguish revoked from expired (`revoked_at`/`revoked_by` or a separate status) and ask for a reason. |
| 18 | Employee (from the code, not seen in this data set) | A user with no manager and no sponsor can submit an application; it then sits in `pending_manager` and nobody is notified (only an administrator could act on it). | `ApplicationFormDialog.tsx`, `notifyApprovers` | Warn in the form, and/or notify administrators when there's no approver. |

## P3: polish and operations

| # | What happens | Where | Fix |
|---|---|---|---|
| 19 | During a forced password change, the app fires 10 data requests that all return `403` (console noise and wasted rate-limit budget). | `dataStore.loadFromApi` / `AuthContext` | Don't load data while `mustChangePassword` is set. |
| 20 | The Content-Security-Policy blocks the Google Fonts stylesheet on every page, so the Inter font never loads (and logs a console error). | `index.html` / `src/index.css` vs `nginx.conf.template` CSP | Self-host Inter, or allow `fonts.googleapis.com`/`fonts.gstatic.com` in `style-src`/`font-src`. |
| 21 | The backend container runs without `NODE_ENV`, and the System tab shows "Node v24 (development)". | `docker-compose.yml` | Set `NODE_ENV: production` for the backend. |
| 22 | The file picker only accepts `.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif`; the backend also accepts webp, xls/xlsx, txt and csv. | `ApplicationFormDialog.tsx` (`accept=`) | Use the same list on both sides. |
| 23 | Requirements can be managed in two places (Settings → Krav and the Krav page). | `SettingsPage.tsx` | Keep one. |

## Verified working (no action needed)

- **Login and forced password change:** login, the forced password change at first login (UI), logout, and logging in as another user in the same tab (no data from the previous user).
- **Route guards:** every role is redirected away from pages it shouldn't see; the sidebar shows the right items per role.
- **Employee:**
  - New application with nested areas (parents auto-selected and locked).
  - The missing-requirements warning with justification, and attachment upload.
  - Submitting a draft ("Skicka in").
  - Search, the notification bell and list, and the profile edit.
- **Line manager:**
  - Approving a contractor (as sponsor) and a team member.
  - The exception path to the facility owner.
  - Denying with a reason.
  - No buttons at the facility step.
- **Facility owner:** deciding exceptions, approving the facility step, revoking access, editing the facility (partial update), creating an area.
- **Administrator:**
  - User list and create/edit dialogs; editing a user keeps their manager.
  - The requirement dialog, saving settings, system status and the expiry job, organisation, logs.
- **Public pages:** contractor form (captcha), forgot password (generic answer), reset with an invalid token.
- **Phone width:** works at 390 px with no horizontal overflow.
