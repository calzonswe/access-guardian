# Access Guardian — RBAC Tillträdessystem

Ett rollbaserat åtkomstkontrollsystem (RBAC) för hantering av tillträdesansökningar till anläggningar och områden. Byggt med React, Express.js och PostgreSQL.

## Innehåll

- [Snabbstart](#snabbstart)
- [Systemkrav](#systemkrav)
- [Installation](#installation)
  - [Docker (produktion)](#docker-produktion)
  - [Lokal utveckling](#lokal-utveckling)
- [Första inloggning](#första-inloggning)
- [Projektstruktur](#projektstruktur)
- [Konfiguration](#konfiguration)
- [Kommandon](#kommandon)
- [Dokumentation](#dokumentation)
- [Felsökning](#felsökning)

---

## Snabbstart

```bash
# 1. Klona repot
git clone <REPO_URL> && cd access-guardian

# 2. Skapa .env-fil
cp .env.example .env
# Redigera .env — ändra DB_PASSWORD och JWT_SECRET

# 3. Starta med Docker Compose
docker compose up -d

# 4. Öppna i webbläsaren
open http://localhost:8080
```

Logga in med `admin@foretag.se` / `Admin123!` (lösenordsändring krävs vid första inloggning).

---

## Systemkrav

| Komponent | Version |
|-----------|---------|
| Docker & Docker Compose | 20+ / v2+ |
| Node.js (för lokal utveckling) | 18+ |
| npm | 9+ |

---

## Installation

### Docker (produktion)

Hela applikationen (databas, backend, frontend) körs i tre Docker-containrar via Docker Compose.

#### 1. Skapa miljövariabler

```bash
cp .env.example .env
```

Redigera `.env`:

```env
# OBLIGATORISKA — ändra dessa innan produktion
DB_PASSWORD=ett_starkt_databaslösenord
JWT_SECRET=en_lång_slumpmässig_sträng_för_jwt

# VALFRIA
APP_PORT=8080          # Port som frontend exponeras på (standard: 8080)
```

#### 2. Bygg och starta

```bash
docker compose up -d --build
```

Detta startar:
- **db** — PostgreSQL 16 med automatisk databasinitiering (`db/init.sql`)
- **backend** — Express.js API på port 3000 (internt)
- **frontend** — React-app serverad via Nginx på port 8080

#### 3. Verifiera

```bash
# Kontrollera att alla containrar körs
docker compose ps

# Kontrollera backend-hälsa
curl http://localhost:3000/health

# Kontrollera frontend-hälsa
curl http://localhost:8080/health
```

#### 4. Stoppa

```bash
docker compose down          # Stoppa utan att radera data
docker compose down -v       # Stoppa OCH radera databasvolym
```

### Lokal utveckling

Frontend och backend kan köras separat utan Docker.

#### Frontend

```bash
npm install
npm run dev
```

Frontend startar på `http://localhost:8080`. I detta läge används localStorage som datakälla (ingen backend behövs).

#### Backend

```bash
cd backend
npm install
npm run dev
```

Backend startar på `http://localhost:3000`. Kräver en PostgreSQL-databas — sätt miljövariabler:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=rbac_access
export DB_USER=rbac_user
export DB_PASSWORD=ditt_lösenord
export JWT_SECRET=din_jwt_hemlighet
```

#### Databas

Initiera PostgreSQL-schemat manuellt:

```bash
psql -U rbac_user -d rbac_access -f db/init.sql
```

---

## Första inloggning

| Fält | Värde |
|------|-------|
| E-post | `admin@foretag.se` |
| Lösenord | `Admin123!` |

> **OBS:** Du måste byta lösenord vid första inloggning. Standardanvändaren skapas av backend vid databasinitiering.

---

## Projektstruktur

```
├── backend/                 # Express.js backend (plain JS)
│   ├── src/
│   │   ├── index.js         # Appstart, route-registrering
│   │   ├── db.js            # PostgreSQL-anslutning
│   │   ├── middleware/
│   │   │   ├── auth.js      # JWT-verifiering & token-signering
│   │   │   ├── rbac.js      # Rollbaserad åtkomstkontroll
│   │   │   └── rateLimit.js # Inloggningsbegränsning
│   │   └── routes/          # API-routes (13 st)
│   └── Dockerfile
├── db/
│   └── init.sql             # Fullständigt databasschema + seed-data
├── src/                     # React frontend (TypeScript)
│   ├── components/          # UI-komponenter (shadcn-ui baserade)
│   ├── context/             # Auth, Theme, Branding contexts
│   ├── pages/               # Sidkomponenter (14 st)
│   ├── services/
│   │   ├── api.ts           # HTTP-klient mot backend
│   │   ├── dataStore.ts     # Abstraktionslager (API/localStorage)
│   │   └── notifications.ts # Notifikationshantering
│   └── types/               # TypeScript-typer
├── docker-compose.yml       # 3-tjänste-uppsättning
├── Dockerfile               # Frontend multi-stage build (Nginx)
├── nginx.conf               # Reverse proxy & caching
└── .env.example             # Mall för miljövariabler
```

---

## Konfiguration

### Miljövariabler

| Variabel | Krävs | Beskrivning | Standard |
|----------|-------|-------------|----------|
| `DB_PASSWORD` | Ja | PostgreSQL-lösenord | — |
| `JWT_SECRET` | Ja | Hemlig nyckel för JWT-signering | — |
| `APP_PORT` | Nej | Port för frontend | `8080` |
| `VITE_API_URL` | Nej | Backend-URL för frontend | `/api` (via Nginx) |

### Systeminställningar (via GUI)

Under **Inställningar** i applikationen kan administratörer konfigurera:

- **Branding** — Applikationsnamn, undertext, logotyp-URL, primärfärg
- **Notifikationer** — Antal dagar före utgång för påminnelser
- **Säkerhet** — Sessionstimeout, max inloggningsförsök

---

## Kommandon

| Uppgift | Kommando |
|---------|----------|
| Full stack (Docker) | `docker compose up -d --build` |
| Frontend dev | `npm run dev` |
| Frontend build | `npm run build` |
| Frontend lint | `npm run lint` |
| Backend dev | `cd backend && npm run dev` |

---

## Dokumentation

| Dokument | Beskrivning |
|----------|-------------|
| [TECHNICAL.md](TECHNICAL.md) | Fullständig teknisk dokumentation (arkitektur, API, databas) |
| [MANUAL.md](MANUAL.md) | Användarhandledning |
| [AGENTS.md](AGENTS.md) | Utvecklarinstruktioner för AI-agenter |

---

## Felsökning

### Containrar startar inte

```bash
docker compose logs db       # Kontrollera databasloggar
docker compose logs backend  # Kontrollera backend-loggar
```

### "Felaktig e-post eller lösenord"

- Kontrollera att e-postadressen är korrekt
- Standardlösenord: `Admin123!`

### "För många inloggningsförsök"

- Vänta 15 minuter eller byt IP-adress
- Rate limit: 5 försök per 15 minuter

### Frontend visar ingen data

- I Docker-läge: verifiera att backend-containern körs (`docker compose ps`)
- I lokal dev: frontend använder localStorage — data finns bara lokalt

### Databas behöver återställas

```bash
docker compose down -v       # Raderar databasvolymen
docker compose up -d --build # Återskapar med init.sql
```
