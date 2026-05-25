
# 1.0-release: vad som behöver fixas

Genomgång av hela kodbasen mot vad som krävs för en stabil produktionssläpp. Listan är sorterad efter allvar.

## Kritiska buggar (blockerar 1.0)

### K1. `system_logs.action`-enum saknar nästan alla nya händelser
`db/init.sql` definierar enum `log_action` med ~17 värden, men `audit()`-anropen försöker skriva in `login_success`, `login_failed`, `password_changed`, `attachment_uploaded`, `attachment_deleted`, `user_deleted`, `area_updated`, `area_deleted`, `application_updated`, `application_deleted`, `application_pending_manager`, `application_pending_facility`, `application_pending_exception`, `application_approved`, `application_denied`, `settings_updated`, `requirement_updated`, `requirement_deleted`, `facility_updated`, `facility_deleted`, `facility_admin_added`, `facility_admin_removed`. Alla dessa kastar `invalid input value for enum`. Audit-helpern sväljer felet, så det syns inte — men loggraden skrivs aldrig.
**Åtgärd:** Migrera kolumnen `system_logs.action` från `log_action`-enum till `VARCHAR(64)` (eller `TEXT`) — fri text passar bättre när nya händelser tillkommer. Lägg också till index på `created_at DESC, action`.

### K2. Ingen DB-migrationsstrategi
`db/init.sql` körs bara på första uppstart av Postgres-volymen. Alla schema-ändringar sedan dess (t.ex. fält i `system_settings`, audit-enum, ev. `mime_type` på attachments) går aldrig in i en befintlig installation.
**Åtgärd:** Lägg in en lättviktig migrations-runner (rena .sql-filer i `db/migrations/` + en `schema_migrations`-tabell, körs vid backend-start). Konvertera nuvarande init.sql till migration `0001_init.sql`.

### K3. Default-admin har hårdkodat lösenord i källkoden
`backend/src/db.js` skapar `admin@foretag.se` med `Admin123!`. Även med `must_change_password=true` är detta en publik bakdörr i alla on-prem-installationer.
**Åtgärd:** Läs `INITIAL_ADMIN_EMAIL` och `INITIAL_ADMIN_PASSWORD` från env. Om de saknas — generera ett engångslösenord, logga det en gång och tvinga byte vid första login. Lägg env-fält i `.env.example` och `docker-compose.yml`.

### K4. Välkomstmejlet visar lösenordet som punkter
`backend/src/routes/users.js` skickar `password.replace(/./g, '•')` till nya användare — meningslöst, admin måste dela lösenordet via en annan kanal.
**Åtgärd:** Två val: (a) visa lösenordet i klartext i mejlet om SMTP är aktivt, eller (b) skicka en engångs-reset-länk istället. (b) är säkrare — kräver en `password_reset_tokens`-tabell (se F4).

## Hög prio (måste fungera korrekt i 1.0)

### H1. Inget glömt-lösenord-flöde
Saknas helt. Om en användare glömmer sitt lösenord finns ingen självservice — admin måste återställa manuellt via API/SQL.
**Åtgärd:** Skapa `password_reset_tokens` (token-hash, user_id, expires_at). Endpoints `POST /api/auth/forgot-password` (rate-limited) och `POST /api/auth/reset-password`. UI-sida `/forgot-password` + länk på login.

### H2. Session-timeout läses ej
`system_settings.security.sessionTimeoutMinutes` finns i UI men JWT är fast 8h och frontend har ingen idle-detektor.
**Åtgärd:** Antingen ärva timeout till JWT-`expiresIn`, eller implementera en frontend-idle-watch med utloggning vid inaktivitet.

### H3. `maxLoginAttempts` kopplas inte till rate-limit
Inställningen finns men `auth.js` använder en hårdkodad in-memory rate-limiter.
**Åtgärd:** Läs `maxLoginAttempts` från `system_settings` och persistera försök per e-post (DB-tabell `login_attempts`) — annars nollas räknarna vid omstart.

### H4. Attachments saknar `mime_type`-kolumn
Filer laddas ner som `application/octet-stream` oavsett original — browsers kan inte previewa PDF/bild inline, ofta tvångsnedladdning.
**Åtgärd:** Migration `ALTER TABLE attachments ADD COLUMN mime_type VARCHAR(100)`. Spara den i POST `/api/attachments` och sätt `Content-Type` i download-handlern.

### H5. Frontend hard-redirectar vid 401
`src/services/api.ts` gör `window.location.href = '/'` vid 401. Användaren förlorar all kontext och osparat formulärdata.
**Åtgärd:** Rensa token + state i AuthContext, visa LoginPage utan full reload, behåll URL för redirect efter inlogg.

### H6. Bilagor laddas upp som base64
`POST /api/attachments` tar JSON med base64 — 33% overhead, hela filen i minnet. Funkar för små filer men slår i `express.json({limit:'10mb'})` redan vid 7.5 MB faktisk fil.
**Åtgärd:** Lägg till multipart-upload (multer) parallellt med befintlig endpoint; uppdatera frontend att använda `FormData`. Behåll base64 som fallback under en release-cykel.

### H7. Nginx CSP saknar `connect-src` för extern API
Om `VITE_API_URL` pekar på annan host blockerar CSP fetch.
**Åtgärd:** Gör CSP konfigurerbar via env (skriv mall i entrypoint), eller dokumentera att API alltid ska gå via nginx-proxy.

### H8. Inställningar för Entra ID / SAML / 2FA är fejkade
Settings-sidan har växlar för Entra, SAML och 2FA men ingen backend-implementation.
**Åtgärd:** Antingen ta bort växlarna till dess funktionen finns (rekommenderat för 1.0), eller markera tydligt "Kommer i v1.1" och disable-state.

## Medel (bör fixas, men inte release-blockerare)

### M1. Paginering saknas på alla list-endpoints
`/api/applications`, `/api/users`, `/api/logs` returnerar allt. Vid hundratals rader blir det långsamt.
**Åtgärd:** Lägg `?page=&pageSize=` + total-count på minst logs, applications, users, notifications.

### M2. Sök/filter saknas i UI
Tabeller har inget filter — räknas med när datat växer.
**Åtgärd:** Lägg till klient-sidans text-filter på alla listsidor (server-side i nästa steg, ihop med M1).

### M3. `attachment_data TEXT` ligger kvar i `user_requirements`
Gammal kolumn för base64-bilagor (icke använd efter SEC-3-omläggningen) — sväljer DB om någon skriver dit av misstag.
**Åtgärd:** Migration som droppar kolumnen, eller migrerar innehållet till filsystem.

### M4. Ingen backup-rutin dokumenterad
Postgres-volymen kan tappas vid Docker-misstag.
**Åtgärd:** Lägg `pg_dump`-cron-exempel i README + dokumentera återställning.

### M5. Ingen graceful shutdown
SIGTERM dödar Express direkt — pågående requests cuttas. Vid Docker-redeploy kan en användares spara-knapp misslyckas.
**Åtgärd:** `process.on('SIGTERM', ...)`-handler som stänger HTTP-server + pool.

### M6. Lösenordspolicy kan inte konfigureras
Krav (>=8, U/L/digit/symbol) är hårdkodade på två ställen (auth, users).
**Åtgärd:** Flytta till `system_settings.security.passwordPolicy` med getter, validera mot den både i backend och frontend.

### M7. Audit-loggning sväljer fel utan att larma
Tysta enum-fel (K1) gick oupptäckta i månader.
**Åtgärd:** När `audit()` misslyckas, skriv minst en `console.error` med `action` + felkod (inte bara `console.warn`).

### M8. Login-API läcker e-post i audit-detaljer
`login_failed`-loggen sparar e-postadressen i klartext — okej för admin men kombinerat med IP kan det räknas som personuppgift utan retention.
**Åtgärd:** Maskera e-post (`abc***@domain`) eller dokumentera GDPR-retention.

## Lågt prio (trevligt-att-ha)

- **L1.** Strukturerad loggning (pino/winston) istället för `console.log`.
- **L2.** Health-check som inkluderar DB-ping (`SELECT 1`), inte bara `{status:'ok'}`.
- **L3.** API-dokumentation (OpenAPI/Swagger).
- **L4.** Captcha eller proof-of-work på publika contractor-formuläret (idag bara IP-rate-limit).
- **L5.** Refresh-tokens — idag bara 8h JWT, ingen tyst förnyelse.
- **L6.** Konfigurerbar lockout-period efter X misslyckade inlogg.
- **L7.** Profilsida tillåter ej egen e-poständring (saknas verifierings­flöde).
- **L8.** UI-komponent för att visa systemstatus (SMTP, expiryJob senaste körning).
- **L9.** `nodemailer` är pinnad till `^8.0.7` — verifiera att versionen verkligen finns/fungerar, annars pinna till `^6.9` eller `^7`.

---

## Föreslagen ordning på arbetet

1. **K1, K2, K3, K4** — kan göras i en pass: ny migrationssystem + första migration som fixar enum + flyttar admin till env + reset-token-tabell.
2. **H1, H4, H5, H8** — användarsynliga brister som annars sticker ut direkt.
3. **H2, H3, H6, H7** — säkerhet/UX-polish.
4. **M1–M8** — kan släppas i 1.1 om tiden tryter, men M3 och M7 är billiga att ta med.
5. Lågt-prio: backlog efter 1.0.

Vill du att jag börjar med Fas 1 (K1–K4: migrationssystem + audit-enum-fix + initial admin via env + reset-token-grund)?
