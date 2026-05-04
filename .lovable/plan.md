
# Bugg- och säkerhetsanalys med åtgärdsplan

## Identifierade buggar

### BUG-1 (Kritisk): JWT-token innehåller roller som statisk payload
`backend/src/middleware/auth.js` läser roller från JWT-tokenen (`req.user = decoded`), men tokenen skapas vid inloggning och uppdateras aldrig. Om en admin ändrar en användares roller träder de inte i kraft förrän användaren loggar in på nytt. **Åtgärd:** Läs alltid roller från databasen i `authMiddleware` istället för att lita på JWT-payloaden.

### BUG-2 (Medel): GET /api/users kräver administrator — line_managers kan inte se sina underställda
`backend/src/routes/users.js` rad 8: `router.use(requireRole('administrator'))` blockerar alla icke-admins. Frontend-koden (`TeamPage`, `ApplicationsPage`, `Dashboard`) anropar `store.getUsers()` som i API-läget hämtar `/api/users`. Icke-admins får 403. **Åtgärd:** Öppna GET `/api/users` för autentiserade användare men returnera begränsat resultat beroende på roll (line_managers ser sin hierarki, facility-roller ser sina anläggnings-användare, övriga ser bara sig själva).

### BUG-3 (Medel): GET /api/facilities returnerar `[]` för employee/contractor
Anställda och underleverantörer får tomt svar från `GET /api/facilities`. `ApplicationsPage` och `MyAccessPage` behöver anläggningsnamn för att visa ansökningar korrekt. **Åtgärd:** Returnera alla anläggningar (med begränsad data) för autentiserade användare, eller åtminstone de anläggningar som är kopplade till användarens ansökningar.

### BUG-4 (Låg): Nginx saknar `/api`-proxy
`nginx.conf` har ingen `location /api` — detta innebär att API-anrop i Docker-miljön aldrig når backend. **Åtgärd:** Lägg till `location /api { proxy_pass http://backend:3000; }`.

### BUG-5 (Låg): Health-check URL-mismatch
Frontend kollar `/api/health` men backend exponerar `/health` (utan `/api`-prefix). I Docker fungerar det inte alls utan nginx-proxy. **Åtgärd:** Ändra backend health-endpoint till `/api/health` eller justera detectMode.

### BUG-6 (Låg): `store.getUsers()` anropas synkront utan refresh
Alla sidor (Dashboard, ApplicationsPage, etc.) läser från `_users`-cachen som bara laddas vid init/`refreshAll()`. Data visas aldrig om man navigerar till en sida direkt utan att mutationer har körts. **Åtgärd:** Anropa `await store.refreshAll()` vid sidladdning, eller kortsiktigt — säkerställ att alla mutations-handlers har `await store.refreshAll()`.

## Identifierade säkerhetshål

### SEC-1 (Kritisk): Ingen input-validering på backend
Inga endpoints validerar input-längd, typ eller format (förutom e-post regex i login). Användare kan skicka godtyckligt stora strängar i `full_name`, `description`, etc. SQL-injektion skyddas av parameteriserade queries, men denial-of-service och dataförstöring är möjligt. **Åtgärd:** Lägg till input-validering (max längd, typ-kontroll) på alla POST/PUT-endpoints.

### SEC-2 (Hög): JWT-hemlighet saknar komplexitetskontroll
`JWT_SECRET` läses från env men det finns ingen kontroll att den är tillräckligt stark. **Åtgärd:** Validera minimum 32 tecken vid uppstart.

### SEC-3 (Hög): Bilagor lagras som base64 direkt i databasen
`backend/src/routes/attachments.js` sparar `file_data` (upp till 10MB base64) rakt i `file_url`-kolumnen. Detta sväljer databasen snabbt. **Åtgärd:** Lagra filer på disk eller objektlagring, spara bara sökväg i DB.

### SEC-4 (Medel): Inget CSRF-skydd
Backend använder CORS med `cors()` (tillåter alla origins). I produktion bör CORS begränsas till den faktiska domänen. **Åtgärd:** Konfigurera CORS-origin via environment-variabel.

### SEC-5 (Medel): Token lagras i localStorage
JWT-token i `localStorage` är sårbar för XSS. **Åtgärd:** Långsiktigt — använd httpOnly cookies. Kortsiktigt — acceptera risken men säkerställ Content-Security-Policy headers.

### SEC-6 (Medel): Lösenordspolicy för svag
Enda kravet är 8 tecken. **Åtgärd:** Kräv minst en stor bokstav, en siffra, och ett specialtecken.

### SEC-7 (Låg): Inget rate-limit på övriga endpoints
Rate-limit finns bara på `/auth/login`. **Åtgärd:** Lägg till generell rate-limiting middleware.

## Åtgärdsplan (prioritetsordning)

### Fas 1 — Kritiska buggar och säkerhet
1. **Fixa nginx.conf** — lägg till `/api`-proxy till backend (BUG-4, BUG-5)
2. **Fixa authMiddleware** — läs roller från DB istället för JWT (BUG-1)
3. **Öppna GET /api/users** för icke-admins med filtrering (BUG-2)
4. **Öppna GET /api/facilities** för alla autentiserade användare (BUG-3)
5. **Lägg till input-validering** på alla POST/PUT-endpoints (SEC-1)
6. **Begränsa CORS** till konfigurerad origin (SEC-4)

### Fas 2 — Medelprioriterade förbättringar
7. **Stärk lösenordspolicyn** (SEC-6)
8. **Validera JWT_SECRET längd** vid uppstart (SEC-2)
9. **Säkerställ `refreshAll()` efter alla mutationer** i frontend (BUG-6)
10. **Lägg till Content-Security-Policy header** i nginx (SEC-5)

### Fas 3 — Långsiktiga förbättringar
11. **Flytta bilagor till filsystem** istället för DB (SEC-3)
12. **Generell rate-limiting** (SEC-7)

---

## Produktions-roadmap

### Redan implementerat
- RBAC med 6 roller, rollbaserad UI
- Ansökningsflöde med multi-steg-godkännande
- Anläggningar, områden, krav-hantering
- Notifikationer, audit-loggar, CSV-export
- Dynamisk branding (namn, logotyp, färg)
- Docker Compose-deployment
- Lösenordsbyte vid första inloggning
- Rate-limiting på inloggning

### Saknas för produktion

**Must-have:**
- Contractor-flöde (publik registrering med sponsor-godkännande)
- E-postnotifikationer (SMTP-integration för påminnelser 30/7/1 dagar)
- Automatisk expiry-hantering (cron/scheduled job som sätter `expired` på utgångna ansökningar/krav)
- Entra ID / SAML-integration (SSO)
- Profilsida — möjlighet att redigera egna uppgifter (telefon, avdelning)
- Fullständig audit-loggning (idag loggas inte alla händelser automatiskt)

**Bör-ha:**
- Sökfunktion på alla listor
- Pagination på backend-endpoints (idag hämtas all data)
- Filuppladdning via multipart/form-data istället för base64
- Backup-strategi och databas-migrering
- Session-timeout (auto-utloggning efter inaktivitet)
- Tvåfaktorsautentisering (2FA/TOTP)

**Trevligt-att-ha:**
- Dashboard-statistik med grafer/diagram
- Rolltilldelning per anläggning (inte bara globalt)
- Webhook-integration för externa system
- Mobilvänlig PWA
- API-dokumentation (Swagger/OpenAPI)

Ska jag börja implementera Fas 1?
