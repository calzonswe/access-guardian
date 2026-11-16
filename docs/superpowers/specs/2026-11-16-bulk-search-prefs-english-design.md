# Design: bulk decisions, global search, notification settings, English (2026-11-16)

Owner-selected suggestions #10, #25, #26 and #28.

## Intent

- **#10 Bulk decisions:** approvers clear a queue in one go instead of opening every application.
- **#25 Global search (Ctrl+K):** find any person, application, facility or page from anywhere.
- **#26 Notification settings:** each user decides which e-mails they get. In-app notifications stay on, so nothing is missed.
- **#28 English:** the whole app, including error messages, notifications and e-mails, is available in English. Mainly for external contractors.

**Non-goals**
- No change to who may approve what. Bulk actions go through the same rules, one application at a time.
- No machine translation, and no more languages than Swedish and English.
- No new third-party services.

**Anti-goals**
- A bulk action that silently skips failures or approves something the user couldn't approve one by one.
- Search results that reveal records the user can't otherwise see.
- A screen that mixes Swedish and English for an English user, apart from the stored audit-log details (see #28).

## Decisions made with the owner

| # | Decision |
|---|---|
| 28 | **Translate everything:** all screens and roles, plus backend error messages, in-app notifications and e-mails. |
| 28 | **Language is a per-user setting stored on the account**, so it follows the user across devices and controls their e-mails. Before login, and on the public contractor form, a small Svenska/English switch defaults to the browser language. |

## Approaches considered

**For English (#28):**
- **A. i18n library (react-i18next) with keyed messages.** This is the industry standard and has plural support, but it adds dependencies, and every string must be invented a key and moved into a file. The work to convert roughly 1,250 strings is high.
- **B. Swedish source text as the key, with a typed English dictionary (chosen).** `t('Ansökningar')` returns the English text if one exists and falls back to the Swedish. Placeholders are written `t('Inaktivera {name}?', { name })`. This needs no dependencies and the source stays readable. Wrapping can be done mechanically, and a test fails the build if any `t('…')` lacks an English entry.
- **C. Translate only the rendered DOM.** Fragile, and rejected.

**On the backend,** choice B also lets one translation layer handle every message without touching all 250 call sites:
- **Errors:** a small response hook translates the `error` text of JSON responses into the caller's language.
- **Notifications:** `notifyUser` translates the title and message into the recipient's language before storing them.
- **E-mails:** the template's fixed texts follow the recipient's language.
- **Dynamic messages:** entries such as `'Max {n} rader per import'` work as patterns, so messages containing values are translated too.

**For search (#25):** a small custom command palette built on the existing Dialog. The `cmdk` package was removed earlier as unused; one search box doesn't justify re-adding it. Results come from the data the browser already holds, so a user can only find what they can already see.

**For bulk decisions (#10):** the browser sends the normal per-application request for each selected item and collects the results. A new bulk endpoint would duplicate the transition rules for little gain at this app's size.

## The design

### Database: migration `0009_language_and_notification_prefs.sql`
- `users.language VARCHAR(2) NOT NULL DEFAULT 'sv'`, limited to `sv` and `en`.
- `users.email_prefs JSONB NOT NULL DEFAULT '{}'`: missing keys count as on.

### #26 Notification settings
- **Three e-mail categories** a user can switch off:
  - **`action`:** applications waiting for my decision, reminders and escalations.
  - **`status`:** decisions and changes on my own applications and accounts.
  - **`expiry`:** access or requirements about to expire, or expired.
- **Always sent:** password reset and new-account e-mails.
- **In-app notifications** are always created.
- **Backend:** `notifyUser(db, userId, { title, message, type, link, category })`. The e-mail goes out only when SMTP is configured, the admin switch is on, and the user's category is on. All existing call sites get a category.
- **Profile:** an "E-postaviseringar" card with three switches. When e-mail is unavailable (no SMTP or admin switch off), a note says so and the switches are disabled. The preferences are saved through `PUT /api/auth/me` (`email_prefs`).

### #10 Bulk decisions
- **Selection:** on Ansökningar, applications the user can act on (`canActOn`) get a checkbox, both in the table and on the phone cards. "Markera alla att hantera" selects every visible row.
- **Bulk bar:** when anything is selected, a bar shows "{n} markerade", **Godkänn** and **Neka**.
  - Approving uses the same next-status rule as the dialog, moved into `nextApproveStatus(app)`.
  - Denying asks for one shared reason, which is required.
- **Results:** applications are processed one by one through the normal request. The result is "{ok} klara, {failed} misslyckades", with the reason for each failure. Failed items stay selected.
- **Before acting:** a confirmation names the count and the action.

### #25 Global search
- **Opening:** a "Sök…" button in the header (with a Ctrl K / ⌘K hint), and the shortcut works on every page.
- **Results:** up to 5 per group. The groups are Sidor (the pages this role can open), Ansökningar (applicant or facility name, status), Personer (users the user can see: name, e-mail, company) and Anläggningar.
- **Matching:** words can be in any order, and case and diacritics don't matter, so "ostra" finds "Östra".
- **Keyboard:** ↑/↓ moves, Enter opens, Esc closes.
- **Where results go:**
  - An application opens its dialog (`/applications/:id`).
  - A person opens Användare filtered on that person for administrators, Mitt team for their line managers, or nothing.
  - A facility opens its areas page if the user may manage it, and Anläggningar otherwise.

### #28 English
- **Frontend:**
  - `src/i18n/` holds `t(text, params?)`, a `useT()` hook that re-renders on a language change, `en.ts` (Swedish text → English), and the language state, initialised from the user, else a saved browser choice, else the browser language.
  - Every user-facing string in pages and components (not `components/ui`) is wrapped.
  - Dates and numbers use the active locale (`sv-SE` or `en-GB`).
  - `<html lang>` follows the language.
- **Language switch:** in the user menu and on Min profil; it is saved to `users.language`. The login, password and contractor pages have a "Svenska | English" switch.
- **Backend:**
  - `services/i18n.js` holds the English dictionary for backend texts and `translate(text, lang)`, with pattern matching for messages containing values.
  - **Request language:** the authenticated user's `language`. Without a session it comes from an `X-Language` header sent by the frontend, falling back to `Accept-Language`.
  - A JSON-response hook translates `error` (and `message`) strings.
  - `notifyUser` and the expiry job's `notifyOnce` translate into the **recipient's** language before storing.
  - `sendMail`/`sendMailToUser` translate the subject, title, call-to-action and footer into the recipient's language.
- **Not translated:**
  - **Audit-log details:** stored historical text, so they stay Swedish. The event names on the log page are translated.
  - **Admin-entered content:** facility, area and requirement names, and branding.
- **Guards:**
  - A unit test scans `src/**/*.tsx` for `t('…')` / `t("…")` calls and fails when any key is missing from `en.ts`.
  - A backend test checks every backend dictionary pattern compiles and round-trips one example.
  - A smoke check confirms that an English user gets an English error and an English notification title.
  - A backend unit test renders the e-mail template in both languages.

## Left to the builder
- The English wording, using clear and plain British English (dates `en-GB`).
- Which variable names to use in placeholders.

## Verification
- **Unit tests:**
  - `nextApproveStatus`.
  - Search matching, including diacritics.
  - The missing-translation scan.
  - The backend pattern translation.
  - The e-mail category gate.
- **Smoke test, new checks:**
  - E-mail preferences are saved and returned. That a turned-off category is respected is covered by a unit test of the gate, `shouldEmail(prefs, category)`, since sending can't be observed without SMTP.
  - The language is saved; an English user's 403 error is in English; their notification titles are in English.
  - Bulk approval works for one item and rejects an item the user may not decide on.
- **Browser:** every role crawled in English with 0 console errors, and a check that no Swedish characters (`åäö`) appear outside admin-entered names and audit details. The bulk bar, the search palette and the profile cards are covered by screenshots in both themes.
