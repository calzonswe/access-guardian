# Bulk decisions, Search, E-mail settings, English: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk approve/deny (#10), Ctrl+K search (#25), per-user e-mail settings (#26) and a full English UI with English backend messages, notifications and e-mails (#28).

**Architecture:** A migration adds `users.language` and `users.email_prefs`. Notifications get a category that gates e-mail per user. Bulk actions and search are frontend-only on top of `canActOn` and the data cache. English uses the Swedish text as the key with an English dictionary: `t()` in the frontend, and in the backend one translation layer for JSON errors, stored notifications and e-mail templates.

**Tech Stack:** React 18 + TypeScript, Express (plain ESM), PostgreSQL 16, vitest, node:test.

**Spec:** `docs/superpowers/specs/2026-11-16-bulk-search-prefs-english-design.md`

## Global Constraints

- Swedish is the default and the key language. English values are plain British English; dates use `en-GB`.
- No new runtime dependencies.
- Schema changes go only in `db/migrations/0009_language_and_notification_prefs.sql`.
- The e-mail categories are exactly `action`, `status` and `expiry`; missing keys mean on. Password reset and welcome e-mails are always sent.
- Bulk actions call the existing `PUT /api/applications/:id` once per application; there is no new endpoint.
- Search only uses data already in the browser's cache.
- Not translated: audit-log `details` and admin-entered names (facilities, areas, requirements, branding).

## Review Focus

1. **Translation coverage:** an English user meets a string nobody wrapped, such as a toast or a `confirm()` text. The missing-key scan (Task 5) plus the `åäö` crawl of the English UI (Task 8) catch it.
2. **Dynamic messages:** a backend message whose value is inside the text (`Max 500 rader per import`) must still translate. Covered by Task 4's pattern round-trip test.
3. **Partial failure in bulk:** a bulk approval where some items fail must report each failure and leave those items selected. Covered by Task 2's manual run and a smoke check.
4. **Search across the alphabet:** "ostra" must find "Östra", and an empty query shows only pages. Covered by Task 3's tests.
5. **Language before and after login:** the language chosen on the login page must carry over to the account if the user has no saved language. Covered by Task 6 (the login sends `X-Language`; the first login stores it when the account is still at the default).

---

### Task 1: Migration, user language and e-mail settings (backend) (#26 core)

**Files:**
- Create: `db/migrations/0009_language_and_notification_prefs.sql`
- Create: `backend/test/emailPrefs.test.js`
- Modify: `backend/src/services/notify.js`, `backend/src/jobs/expiryJob.js`, `backend/src/routes/{applications,users,auth}.js`, `backend/src/middleware/auth.js`

**Interfaces:**
- Produces:
  - `shouldEmail(prefs: object|null, category: 'action'|'status'|'expiry'|undefined): boolean` in `services/notify.js`. An undefined category or a missing key counts as true.
  - `notifyUser(db, userId, { title, message, type, link, category })`.
  - `req.user.language` (`'sv'|'en'`).
  - `PUT /api/auth/me` accepts `language` (`sv`/`en`) and `email_prefs` (an object of booleans for the three keys); `/auth/me` and the login responses return both.
  - Login stores `X-Language` as the user's language if it is `en` and the account is still `sv` with no explicit choice (`language_set = false`).

- [ ] Write a failing test: `shouldEmail({}, 'action')` is true; `{action:false}` with `'action'` is false; `{action:false}` with `'status'` is true; any prefs with no category are true.
- [ ] Write the migration: `language`, `language_set BOOLEAN DEFAULT false`, `email_prefs JSONB DEFAULT '{}'`.
- [ ] Implement `shouldEmail` and give every `notifyUser`/`notifyOnce` call a category:
  - **`action`:** approvers, reminders, escalation, manager change, the no-approver fallback.
  - **`status`:** applicant status changes, deactivation notices to owners.
  - **`expiry`:** the expiry job's warnings and expiries.
- [ ] Run the tests (all pass), then commit.

### Task 2: Bulk decisions (#10)

**Files:**
- Modify: `src/lib/applicationRules.ts` (+ test), `src/components/dashboard/ApplicationTable.tsx`, `src/pages/ApplicationsPage.tsx`
- Create: `src/components/applications/BulkActionBar.tsx`

**Interfaces:**
- Produces:
  - `nextApproveStatus(app: Application): ApplicationStatus | null`. It maps `pending_manager` to `pending_exception` when `has_exception`, otherwise to `pending_facility`; `pending_facility` and `pending_exception` map to `approved`; anything else maps to null. The dialog's `handleApprove` uses it.
  - `ApplicationTable` gains optional `selectable?: (app) => boolean`, `selectedIds?: Set<string>` and `onToggleSelect?: (id) => void`.

- [ ] Add tests for `nextApproveStatus`, then implement it.
- [ ] Add checkboxes in the table and the phone cards; clicking a checkbox must not open the row.
- [ ] Add the bulk bar:
  - It shows "{n} markerade", Godkänn, Neka (a dialog with a required reason) and Avmarkera.
  - It runs sequentially and finishes with a toast "{ok} klara, {failed} misslyckades", with the first failure's reason.
  - It keeps the failed items selected and reloads the list.
- [ ] Add "Markera alla att hantera" to the list header when any visible row is selectable.
- [ ] Run `tsc`, lint and the tests, then commit.

### Task 3: Global search (#25)

**Files:**
- Create: `src/lib/search.ts` (+ test), `src/components/layout/GlobalSearch.tsx`
- Modify: `src/components/layout/AppHeader.tsx`

**Interfaces:**
- Produces:
  - `normalize(s: string): string`: lowercase with diacritics removed (NFD, combining marks stripped).
  - `matches(query: string, ...fields: (string|undefined)[]): boolean`: every query word appears in the joined fields.
  - `<GlobalSearch open onOpenChange />`. `AppHeader` holds the open state, registers Ctrl/⌘+K, and shows a "Sök…" button with a shortcut hint (an icon only on phones).

- [ ] Write tests: `normalize('Östra Lagret')` → `'ostra lagret'`; `matches('lag ost', 'Östra Lagret')` → true; `matches('nord', 'Lager Syd')` → false.
- [ ] Implement:
  - **Groups:** Sidor, Ansökningar, Personer and Anläggningar, with at most 5 each; navigation follows the spec.
  - **Keyboard:** ↑/↓/Enter/Esc, with the active option shown via `aria-activedescendant`.
- [ ] Run `tsc`, lint and the tests, then commit.

### Task 4: Backend translation layer (#28)

**Files:**
- Create: `backend/src/services/i18n.js`, `backend/src/services/i18n.en.js` (dictionary), `backend/test/i18n.test.js`
- Modify: `backend/src/index.js` (response hook), `services/notify.js`, `jobs/expiryJob.js`, `services/email.js`, `routes/contractor.js` (direct notification insert)

**Interfaces:**
- Produces:
  - `translate(text: string, lang: 'sv'|'en'): string`. It tries an exact match first, then the pattern entries: keys containing `{name}` are compiled to regexes once, and captured values are substituted into the English. Unknown text is returned unchanged.
  - `requestLanguage(req): 'sv'|'en'` uses the user's language, then `X-Language`, then `Accept-Language`.
  - `async userLanguage(db, userId): 'sv'|'en'`.
  - `buildHtml({ title, body, ctaLabel, ctaUrl, lang })` translates the footer and the call-to-action label.
  - Response hook: `res.json` translates the `error` and `message` string fields when the language is `en`.

- [ ] Write the tests:
  - An exact key translates.
  - A pattern `'Max {n} rader per import'` turns `'Max 500 rader per import'` into `'At most 500 rows per import'`.
  - Unknown text passes through.
  - Every dictionary key containing `{` compiles.
  - `buildHtml` with `lang 'en'` contains the English footer.
- [ ] Build the dictionary from every Swedish user-facing string in `backend/src`: errors, notification titles and messages, and e-mail texts. List them with `grep -rhoE "(error|title|message|subject|ctaLabel|body): ['\`][^'\`]+" backend/src`.
- [ ] Run the tests, `node --check` and the smoke test, then commit.

### Task 5: Frontend translation core and string wrapping (#28)

**Files:**
- Create:
  - `src/i18n/index.ts`: `t`, `useT`, `setLanguage`, `getLanguage`, `locale()` and `formatDate`/`formatDateTime`.
  - `src/i18n/en.ts`
  - `src/i18n/i18n.test.ts` (the missing-key scan)
  - `scripts/i18n-wrap.mjs` (a one-off codemod, kept for future files)
- Modify: every `.tsx` in `src/pages`, `src/components` (not `ui/`) and `src/context`, plus `src/services/notifications.ts` and `exportService.ts` (CSV headers)

**Interfaces:**
- Produces:
  - `t(sv: string, params?: Record<string, string | number>): string`.
  - `useT(): typeof t`, which subscribes to language changes.
  - `getLanguage(): 'sv'|'en'` and `setLanguage(lang, { persist?: boolean })`; the latter updates `<html lang>`, `localStorage 'ag-lang'` and the listeners.
  - `locale(): 'sv-SE'|'en-GB'`.
  - `api.ts` sends `X-Language` on every request.

- [ ] Write the core module with tests: interpolation; a missing translation falls back to Swedish; the scan of all `t('…')` and `t("…")` keys in `src` finds every key in `en.ts`.
- [ ] Write a codemod using the TypeScript compiler API to wrap Swedish-looking strings:
  - JSX text, and string literals in JSX attributes (`placeholder`, `title`, `aria-label`, `label`).
  - Calls to `toast.*`, `confirm` and `setError`.
  - Object literal values in label maps such as `STATUS_MAP` and `ROLE_LABELS`.
  - Template literals are reported for manual conversion.
- [ ] Run the codemod and review the diff per file; convert the reported template literals by hand.
- [ ] Generate a list of keys missing from `en.ts`, write the English values, and make the test pass.
- [ ] Replace `toLocaleString('sv-SE')` / `toLocaleDateString('sv-SE')` with `formatDateTime` and `formatDate`.
- [ ] Run `tsc`, lint, the tests and the build, then commit.

### Task 6: Language and e-mail settings UI (#26, #28)

**Files:**
- Create: `src/components/users/EmailPrefsCard.tsx`, `src/components/layout/LanguageSwitch.tsx`
- Modify:
  - `src/pages/ProfilePage.tsx`, `src/components/layout/AppHeader.tsx` (language choice in the user menu)
  - `src/pages/LoginPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `ContractorApplyPage.tsx`, `ChangePasswordPage.tsx` (switch)
  - `src/context/AuthContext.tsx` (apply the user's language on login/me)
  - `src/services/api.ts` and `dataStore.ts` (`updateOwnProfile` accepts `language` and `email_prefs`)

- [ ] Implement the language switch: choosing a language in the app saves it to the account; on the public pages it is saved in the browser only.
- [ ] Implement the e-mail card with three switches, disabled with a note when e-mail is unavailable (`GET /settings/branding` gains `emailAvailable`).
- [ ] Run `tsc`, lint and the tests, then commit.

### Task 7: Smoke checks

**Files:**
- Modify: `scripts/smoke-test.mjs`

- [ ] **E-mail settings:** `email_prefs` are saved and returned.
- [ ] **Language:**
  - `language: 'en'` is saved.
  - An English user's 403 error is in English, and an approval notification created for them has an English title.
  - A Swedish user still gets Swedish.
- [ ] **Bulk-style approval:** two sequential PUTs; one the user may decide (200) and one they may not (403).
- [ ] Run on a fresh stack and expect all to pass, then commit.

### Task 8: Browser verification and docs

- [ ] **Crawl** all roles in English:
  - 0 console errors.
  - Collect visible text containing `åäö`, excluding seeded names; expect none from the UI chrome.
- [ ] **Screenshots** of the bulk bar, the search palette, the e-mail card and the language switch, in light and dark.
- [ ] **Docs:** update the README (features, settings, languages) and `CLAUDE.md` (i18n convention: wrap every new user-facing string in `t()`; the scan test enforces it). Then commit.
