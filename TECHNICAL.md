# Access Guardian — Teknisk dokumentation

## Innehåll

1. [Arkitekturöversikt](#arkitekturöversikt)
2. [Roller och behörigheter](#roller-och-behörigheter)
3. [Ansökningsflöde](#ansökningsflöde)
4. [Databasschema](#databasschema)
5. [Backend API-referens](#backend-api-referens)
6. [Autentisering och säkerhet](#autentisering-och-säkerhet)
7. [Frontend-arkitektur](#frontend-arkitektur)
8. [Hybrid datalagringsarkitektur](#hybrid-datalagringsarkitektur)
9. [Infrastruktur och driftsättning](#infrastruktur-och-driftsättning)

---

## Arkitekturöversikt

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   Frontend   │────▶│    Backend    │────▶│  PostgreSQL   │
│  React/Vite  │     │  Express.js   │     │     16        │
│  Nginx :80   │     │    :3000      │     │    :5432      │
└──────────────┘     └───────────────┘     └──────────────┘
       │                     │
       │  /api/* proxy       │  pg driver
       └─────────────────────┘
```

| Lager | Teknik | Beskrivning |
|-------|--------|-------------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn-ui | SPA med rollbaserad navigering |
| Backend | Express.js 4 (plain JS, ESM), bcryptjs, jsonwebtoken, pg | REST API med JWT-auth och RBAC-middleware |
| Databas | PostgreSQL 16 | Fullständigt schema med enums, triggers och hjälpfunktioner |
| Webbserver | Nginx Alpine | Reverse proxy, SPA-fallback, caching, säkerhetsheaders |
| Orkestrering | Docker Compose | 3 tjänster: db → backend → frontend |

---

## Roller och behörigheter

### Rollhierarki

```
administrator
├── facility_owner
│   └── facility_admin
│       └── line_manager
│           ├── employee
│           └── contractor
```

### Rolldefinitioner

| Roll | Svenskt namn | Behörigheter |
|------|-------------|--------------|
| `administrator` | Administratör | Full systemåtkomst. Hanterar användare, inställningar, roller, alla anläggningar. Godkänner avsteg. |
| `facility_owner` | Anläggningsägare | Full kontroll över egna anläggningar. Godkänner tillträdesansökningar och avsteg. Kan återkalla tillträde. |
| `facility_admin` | Anläggningsadministratör | Hanterar tilldelade anläggningar. Granskar status, godkänner standardansökningar. |
| `line_manager` | Linjechef | Godkänner ansökningar från sina direktrapporterande. Hanterar krav för teamet. |
| `employee` | Anställd | Ansöker om tillträde till anläggningar och områden. |
| `contractor` | Entreprenör | Ansöker om tillträde. Kräver intern kontaktperson (sponsor). |

### Sidåtkomst per roll

| Sida | Roller |
|------|--------|
| Dashboard | Alla |
| Ansökningar | Alla |
| Anläggningar | administrator, facility_owner, facility_admin |
| Områden | administrator, facility_owner, facility_admin |
| Krav | administrator, facility_owner, facility_admin, line_manager |
| Användare | administrator |
| Organisation | administrator |
| Mitt team | line_manager |
| Min åtkomst | employee, contractor |
| Notifikationer | Alla |
| Loggar | administrator |
| Inställningar | administrator |
| Profil | Alla |

---

## Ansökningsflöde

### Statusövergångar

```
                  ┌──────────┐
                  │  draft   │
                  └────┬─────┘
                       │ Skicka in
                  ┌────▼──────────┐
                  │pending_manager│
                  └────┬──────┬───┘
          Godkänd │         │ Nekad
           ┌──────▼──────┐  │  ┌────────┐
           │pending_     │  └──▶ denied │
           │facility     │     └────────┘
           └──┬───────┬──┘
    Godkänd │       │ Krav saknas
     ┌──────▼──┐  ┌─▼──────────────┐
     │approved │  │pending_exception│
     └─────────┘  └──┬──────────┬──┘
            Godkänd │          │ Nekad
             ┌──────▼──┐  ┌───▼────┐
             │approved │  │ denied │
             └─────────┘  └────────┘
```

### Steg-för-steg

1. **draft** — Användaren skapar ansökan, väljer anläggning och eventuella områden
2. **pending_manager** — Linjechef/kontaktperson granskar och godkänner eller nekar
3. **pending_facility** — Anläggningsägare/-admin granskar och godkänner eller nekar
4. **pending_exception** — Om krav saknas: administratör beslutar om avsteg
5. **approved** — Tillträde beviljat
6. **denied** — Ansökan nekad (med motivering)
7. **expired** — Tillträde utgånget (passerats slutdatum)

### Avsteg (exceptions)

När en sökande inte uppfyller alla krav för anläggningen/området kan en ansökan markeras med `has_exception = true`. Sökanden måste ange `exception_justification`. Ansökan eskaleras till `pending_exception` och kan enbart godkännas av anläggningsägare.

---

## Databasschema

### Enum-typer

| Enum | Värden |
|------|--------|
| `app_role` | administrator, facility_owner, facility_admin, line_manager, employee, contractor |
| `requirement_type` | certification, clearance, training |
| `application_status` | draft, pending_manager, pending_facility, pending_exception, approved, denied, expired |
| `security_level` | low, medium, high, critical |
| `fulfillment_status` | fulfilled, expired, pending |
| `notification_type` | info, warning, action_required |
| `log_action` | 18 åtgärdstyper (se nedan) |

### Tabellöversikt

#### `users`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | Unikt ID |
| email | VARCHAR(255) UNIQUE | E-postadress |
| full_name | VARCHAR(255) | Fullständigt namn |
| first_name | VARCHAR(128) | Förnamn |
| last_name | VARCHAR(128) | Efternamn |
| password_hash | VARCHAR(255) | bcrypt-hashat lösenord |
| department | VARCHAR(100) | Avdelning |
| title | VARCHAR(255) | Befattning |
| phone | VARCHAR(50) | Telefon |
| manager_id | UUID FK → users | Närmaste chef |
| contact_person_id | UUID FK → users | Kontaktperson (entreprenörer) |
| company | VARCHAR(255) | Företag |
| is_active | BOOLEAN | Aktiv (standard: true) |
| must_change_password | BOOLEAN | Kräv lösenordsbyte |
| created_at | TIMESTAMPTZ | Skapad |
| updated_at | TIMESTAMPTZ | Uppdaterad (auto-trigger) |

#### `user_roles`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| user_id | UUID FK → users | |
| role | app_role | Tilldelad roll |
| | UNIQUE(user_id, role) | En roll per användare |

#### `facilities`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| name | VARCHAR(255) | Anläggningsnamn |
| description | TEXT | Beskrivning |
| address | TEXT | Adress |
| owner_id | UUID FK → users | Ägare |
| created_at / updated_at | TIMESTAMPTZ | Tidsstämplar |

#### `facility_admins`
Kopplingstabell: facility_id ↔ user_id (UNIQUE)

#### `areas`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| facility_id | UUID FK → facilities | Tillhörande anläggning |
| name | VARCHAR(255) | Områdesnamn |
| description | TEXT | Beskrivning |
| security_level | security_level | Säkerhetsnivå (low/medium/high/critical) |

#### `requirements`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| name | VARCHAR(255) | Kravnamn |
| description | TEXT | Beskrivning |
| type | requirement_type | certification/clearance/training |
| has_expiry | BOOLEAN | Har utgångsdatum |
| validity_days | INTEGER | Giltighetstid i dagar |

#### `area_requirements` / `facility_requirements`
Kopplingstabeller: area_id/facility_id ↔ requirement_id (UNIQUE)

#### `user_requirements`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| user_id | UUID FK | |
| requirement_id | UUID FK | |
| fulfilled_at | TIMESTAMPTZ | Uppfyllt datum |
| expires_at | TIMESTAMPTZ | Utgångsdatum |
| certified_by | UUID FK → users | Verifierad av |
| status | fulfillment_status | fulfilled/expired/pending |
| attachment_name | VARCHAR(255) | Bifogat filnamn |
| attachment_data | TEXT | Base64-kodad fildata |

#### `applications`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| applicant_id | UUID FK → users | Sökande |
| facility_id | UUID FK → facilities | Anläggning |
| status | application_status | Aktuell status |
| start_date | DATE | Startdatum |
| end_date | DATE | Slutdatum (null = tillsvidare) |
| has_exception | BOOLEAN | Avsteg begärt |
| exception_justification | TEXT | Motivering |
| manager_approved_at/by | TIMESTAMPTZ/UUID | Chefsgodkännande |
| facility_approved_at/by | TIMESTAMPTZ/UUID | Anläggningsgodkännande |
| exception_approved_at/by | TIMESTAMPTZ/UUID | Avstegsgodkännande |
| denied_reason | TEXT | Nekande-motivering |

#### `application_areas`
Kopplingstabell: application_id ↔ area_id (UNIQUE)

#### `attachments`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| application_id | UUID FK | |
| file_name | VARCHAR(255) | Filnamn |
| file_url | TEXT | Fil-URL/data |
| uploaded_at | TIMESTAMPTZ | |

#### `system_logs`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| action | log_action | Åtgärdstyp |
| actor_id | UUID FK → users | Utförare |
| target_id | UUID | Mål-ID |
| target_type | VARCHAR(50) | Måltyp |
| details | TEXT | Detaljer (JSON) |
| created_at | TIMESTAMPTZ | |

#### `notifications`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| user_id | UUID FK → users | Mottagare |
| title | VARCHAR(255) | Rubrik |
| message | TEXT | Meddelande |
| type | notification_type | info/warning/action_required |
| read | BOOLEAN | Läst |
| link | VARCHAR(500) | Valfri länk |

#### `system_settings`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| key | VARCHAR(100) UNIQUE | Inställningsnyckel |
| value | JSONB | Värde |

#### `organization_positions`
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | UUID PK | |
| title | VARCHAR(255) | Positionsnamn |
| department | VARCHAR(100) | Avdelning |
| parent_id | UUID FK → self | Överordnad position |
| user_id | UUID FK → users | Kopplad användare |
| sort_order | INTEGER | Sorteringsordning |

### Databasindex

Index finns på alla vanliga join-kolumner och filter:
- `user_roles(user_id)`, `user_roles(role)`
- `areas(facility_id)`, `area_requirements(area_id)`, `facility_requirements(facility_id)`
- `user_requirements(user_id)`, `user_requirements(status)`
- `applications(applicant_id)`, `applications(facility_id)`, `applications(status)`
- `system_logs(action)`, `system_logs(actor_id)`, `system_logs(created_at DESC)`
- `notifications(user_id)`, `notifications(user_id, read)`

### Hjälpfunktioner och triggers

- **`has_role(user_id, role)`** — SECURITY DEFINER-funktion för rollkontroll
- **`update_updated_at()`** — Trigger som automatiskt uppdaterar `updated_at` på users, facilities, applications, organization_positions

### Seed-data

Standardinställningar laddas vid databasinitiering:

```json
{
  "branding": { "appName": "RBAC Access", "subtitle": "Tillträdeshantering" },
  "notifications": { "expiryWarningDays": [30, 7, 1] },
  "security": { "sessionTimeoutMinutes": 30, "maxLoginAttempts": 5 }
}
```

---

## Backend API-referens

Alla skyddade endpoints kräver headern `Authorization: Bearer <JWT-token>`.

### Autentisering

| Metod | Endpoint | Beskrivning | Skyddad |
|-------|----------|-------------|---------|
| POST | `/api/auth/login` | Logga in | Nej |
| GET | `/api/auth/me` | Hämta inloggad användare | Ja |
| POST | `/api/auth/change-password` | Byt lösenord | Ja |

**POST /api/auth/login**
```json
// Request
{ "email": "user@example.com", "password": "password" }

// Response
{ "token": "jwt...", "user": { ... }, "mustChangePassword": false }
```

**POST /api/auth/change-password**
```json
// Request
{ "oldPassword": "old", "newPassword": "new" }

// Response
{ "token": "new_jwt...", "message": "Lösenord ändrat" }
```

### Användare (admin-only)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/users` | Lista alla användare med roller |
| GET | `/api/users/:id` | Hämta enskild användare |
| POST | `/api/users` | Skapa ny användare |
| PUT | `/api/users/:id` | Uppdatera användare |
| DELETE | `/api/users/:id` | Radera användare (ej sig själv) |

### Anläggningar

| Metod | Endpoint | Beskrivning | Roller |
|-------|----------|-------------|--------|
| GET | `/api/facilities` | Lista anläggningar (filtrerat per roll) | Alla |
| GET | `/api/facilities/:id` | Hämta anläggning | Ägare/admin |
| POST | `/api/facilities` | Skapa anläggning | administrator |
| PUT | `/api/facilities/:id` | Uppdatera anläggning | Ägare/admin |
| DELETE | `/api/facilities/:id` | Radera anläggning | administrator |
| POST | `/api/facilities/:id/admins` | Lägg till admin | administrator |
| DELETE | `/api/facilities/:id/admins/:userId` | Ta bort admin | administrator |

### Områden

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/areas?facility_id=:id` | Lista områden (filtrerat) |
| POST | `/api/areas` | Skapa område |
| PUT | `/api/areas/:id` | Uppdatera område |
| DELETE | `/api/areas/:id` | Radera område |

### Krav

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/requirements` | Lista alla krav |
| POST | `/api/requirements` | Skapa krav |
| PUT | `/api/requirements/:id` | Uppdatera krav |
| DELETE | `/api/requirements/:id` | Radera krav (admin) |

### Anläggningskrav

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/facility-requirements?facility_id=:id` | Lista krav för anläggning |
| POST | `/api/facility-requirements` | Koppla krav till anläggning |
| DELETE | `/api/facility-requirements?facility_id=:id&requirement_id=:id` | Ta bort koppling |

### Områdeskrav

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/area-requirements?area_id=:id` | Lista krav för område |
| POST | `/api/area-requirements` | Koppla krav till område |
| DELETE | `/api/area-requirements?area_id=:id&requirement_id=:id` | Ta bort koppling |

### Användarkrav

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/user-requirements?user_id=:id` | Lista kravuppfyllnad |
| POST | `/api/user-requirements` | Registrera kravuppfyllnad |
| PUT | `/api/user-requirements/:id` | Uppdatera uppfyllnad |
| DELETE | `/api/user-requirements/:id` | Radera uppfyllnad |

### Ansökningar

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/applications` | Lista ansökningar (filtrerat per roll) |
| GET | `/api/applications/:id` | Hämta ansökan (behörighetskontroll) |
| POST | `/api/applications` | Skapa ansökan |
| PUT | `/api/applications/:id` | Uppdatera/godkänn/neka ansökan |
| DELETE | `/api/applications/:id` | Radera (enbart draft/denied, ägare) |

### Bilagor

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| POST | `/api/attachments` | Ladda upp bilaga (base64, max 10 MB) |
| DELETE | `/api/attachments/:id` | Radera bilaga |

### Notifikationer

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/notifications?user_id=:id` | Lista notifikationer |
| POST | `/api/notifications` | Skapa notifikation |
| PUT | `/api/notifications/:id/read` | Markera som läst |
| PUT | `/api/notifications/read-all?user_id=:id` | Markera alla som lästa |

### Systemloggar

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/logs` | Lista loggar (filtrering stöds) |

### Organisation

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/org` | Hämta organisationsträd |
| PUT | `/api/org` | Uppdatera organisation |

### Inställningar (admin-only)

| Metod | Endpoint | Beskrivning |
|-------|----------|-------------|
| GET | `/api/settings` | Hämta alla inställningar |
| PUT | `/api/settings` | Uppdatera inställningar |
| PUT | `/api/settings/:key` | Uppdatera enskild inställning |

### Övrigt

| Metod | Endpoint | Beskrivning | Skyddad |
|-------|----------|-------------|---------|
| GET | `/health` | Hälsokontroll | Nej |

---

## Autentisering och säkerhet

### JWT-token

- Signeras med `JWT_SECRET` (miljövariabel, obligatorisk)
- Utgångstid: **8 timmar**
- Payload: `{ id, email, roles }`
- Skickas som `Authorization: Bearer <token>` i alla skyddade anrop

### Lösenordshantering

- Lösenord hashas med **bcryptjs** (salt rounds: 10)
- Minst **8 tecken**
- Nya användare har `must_change_password = true` — tvingat byte vid första inloggning

### Rate limiting

- **5 inloggningsförsök per 15 minuter per IP**
- Returnerar HTTP 429 vid överskridande
- Implementerat som in-memory räknare i `rateLimit.js`

### RBAC-middleware

Backend-middleware i `rbac.js`:

- **`requireRole(...roles)`** — Kontrollerar att användaren har minst en av angivna roller
- **`requireFacilityAccess(paramName)`** — Kontrollerar att användaren är admin/ägare för anläggningen
- **`requireAreaAccess(paramName)`** — Kontrollerar att användaren har access till områdets anläggning
- **`isFacilityAdminOrOwner(userId, facilityId)`** — Asynkron DB-kontroll
- **`isManagerOf(userId, targetUserId)`** — Kontrollerar chefsrelation
- **`getManagedUserIds(managerId)`** — Rekursiv hämtning av alla underställda

### Nginx-säkerhet

Produktionens Nginx-konfiguration inkluderar:

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Server-versionsdöljning (`server_tokens off`)

---

## Frontend-arkitektur

### Teknologier

- **React 18** med TypeScript 5
- **Vite 5** som bundler
- **Tailwind CSS 3** för styling (semantiska design tokens)
- **shadcn-ui** som komponentbibliotek
- **React Router 6** för klientsidig routing
- **React Query** (TanStack) för server-state
- **Lucide React** för ikoner

### Kontexthantering

| Context | Ansvar |
|---------|--------|
| `AuthContext` | Inloggning, utloggning, rollkontroll, lösenordsbyte |
| `ThemeContext` | Ljust/mörkt tema |
| `BrandingContext` | Appnamn, logotyp, primärfärg (läses från systeminställningar) |

### Sökvägsalias

`@/*` mappas till `./src/*` via Vite och TypeScript.

### Komponenthierarki

```
App
├── QueryClientProvider
├── ThemeProvider
├── BrandingProvider
├── AuthProvider
│   └── AuthGuard
│       └── AppLayout (sidebar + header)
│           └── Routes
│               ├── Dashboard
│               ├── ApplicationsPage
│               ├── FacilitiesPage (RoleGuard)
│               ├── AreasPage (RoleGuard)
│               ├── RequirementsPage (RoleGuard)
│               ├── UsersPage (RoleGuard: admin)
│               ├── OrganizationPage (RoleGuard: admin)
│               ├── TeamPage (RoleGuard: line_manager)
│               ├── MyAccessPage (RoleGuard: employee/contractor)
│               ├── NotificationsPage
│               ├── LogsPage (RoleGuard: admin)
│               ├── SettingsPage (RoleGuard: admin)
│               └── ProfilePage
```

---

## Hybrid datalagringsarkitektur

Frontend använder ett abstraktionslager (`dataStore.ts`) som automatiskt väljer datakälla:

| Miljö | Datakälla | Detektering |
|-------|-----------|-------------|
| Docker / produktion | Backend API (`/api/*`) | `api.getHealth()` lyckas |
| Lovable preview / lokal dev utan backend | localStorage | Fallback om API ej svarar |

### Flöde

```
dataStore.initPromise  →  testar api.getHealth()
                           ├── OK     → apiMode = true  → alla anrop via api.ts
                           └── Misslyckas → apiMode = false → localStorage
```

Alla sidkomponenter anropar `store.*`-metoder som transparent delegerar till rätt källa. Detta gör att applikationen fungerar fullt i preview utan backend.

---

## Infrastruktur och driftsättning

### Docker Compose-tjänster

| Tjänst | Image | Port | Beroende |
|--------|-------|------|----------|
| `db` | postgres:16-alpine | 5432 (internt) | — |
| `backend` | Node 20 (byggs) | 3000 (internt) | db (healthcheck) |
| `frontend` | Nginx Alpine (multi-stage) | 80 → APP_PORT | backend |

### Frontend-byggprocess

```
Node 20 Alpine (build stage)
  → npm ci → npm run build → dist/

Nginx Alpine (production stage)
  → Kopierar dist/ till /usr/share/nginx/html
  → Kopierar nginx.conf
  → Kör som non-root (nginx-user)
```

### Nginx reverse proxy

- `/` → SPA fallback (`try_files $uri $uri/ /index.html`)
- `/health` → Returnerar 200 OK
- Statiska filer (JS/CSS): cacheas 1 år (Vite hash)
- Bilder: cacheas 30 dagar
- Gzip-komprimering aktivt

### Databasinitiering

`db/init.sql` körs automatiskt vid första start via Docker-volymen:

```yaml
volumes:
  - ./db/init.sql:/docker-entrypoint-initdb.d/01-init.sql
```

Vid omstart med existerande volym: schemat körs **inte** igen. Använd `docker compose down -v` för att återställa.

### Hälsokontroller

| Tjänst | Kontroll | Intervall |
|--------|----------|-----------|
| db | `pg_isready` | 10s |
| frontend (Nginx) | `wget http://localhost/health` | 30s |
| backend | `GET /health` (manuell) | — |

---

*Senast uppdaterad: April 2026*
