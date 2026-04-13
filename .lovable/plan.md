

# Utvärdering och topp-3 prioriterade åtgärder

## Övergripande bedömning

Applikationen fungerar korrekt i **localStorage-läge** (Lovable preview). Backend-koden och Docker-uppsättningen ser i stort komplett ut med auth, RBAC, rate limiting, och alla CRUD-routes. Jag har dock identifierat tre problem sorterade efter allvarlighetsgrad.

---

## Åtgärd 1 (Kritisk): Bugg i GET /api/applications för icke-admins

**Fil:** `backend/src/routes/applications.js`, rad 53-88

`appIds` blandar **användar-ID:n** (rad 55: `appIds.add(userId)`) med **ansöknings-ID:n** (rad 71: `appRows.forEach(r => appIds.add(r.id))`). Sedan körs `WHERE a.id = ANY($1)` — dvs. alla användar-ID:n i setet matchar aldrig en ansöknings-rad. Konsekvens: anställda och linjechefer utan facility-roll ser **inga egna ansökningar** i Docker/API-läget.

**Fix:** Separera logiken — bygg en `applicantIds`-set för `WHERE a.applicant_id = ANY(...)` och ett `facilityAppIds`-set för `WHERE a.id = ANY(...)`, kombinera med `UNION` eller `OR`.

---

## Åtgärd 2 (Medel): AppHeader notifikationer använder localStorage direkt i API-läge

**Fil:** `src/components/layout/AppHeader.tsx`, rad 26-36

`markRead()` skriver direkt till `localStorage['rbac_notifications']` oavsett om appen körs i API-läge. Detta innebär att markering av notifikationer som lästa inte persisteras till backend i Docker-miljön. Bör anropa `api.markNotificationRead(id)` i API-läge.

**Fix:** Kontrollera `store.isApiMode()` i `markRead` och anropa rätt API-endpoint istället för localStorage-manipulation.

---

## Åtgärd 3 (Medel): Alla sidor använder synkrona `store.*`-anrop utan React Query

Sidorna (Dashboard, ApplicationsPage, FacilitiesPage, etc.) anropar `store.getUsers()`, `store.getApplications()` etc. synkront vid render. I API-läge returnerar dessa cachead data som laddas vid `initPromise`, men uppdateras aldrig automatiskt efter mutation förrän `refreshAll()` körs manuellt. Det finns ingen loading/error-state och inget automatiskt refetch.

**Fix (stegvis):** Kortsiktigt — se till att alla mutations-handlers (skapa/uppdatera/ta bort) anropar `await store.refreshAll()` konsekvent. Långsiktigt — migrera till React Query hooks som wrapprar API-anropen med automatisk cache-invalidering.

---

## Teknisk sammanfattning

| # | Problem | Fil(er) | Svårighetsgrad |
|---|---------|---------|----------------|
| 1 | appIds blandar user-ID och app-ID | `backend/src/routes/applications.js` | Kritisk |
| 2 | Notifikation-markering ignorerar API-läge | `src/components/layout/AppHeader.tsx` | Medel |
| 3 | Synkron cache utan auto-refresh efter mutation | Alla sidkomponenter | Medel |

Jag rekommenderar att alla tre åtgärdas i denna ordning. Åtgärd 1 är en databugg som gör att icke-admins inte ser sina ansökningar i produktionsmiljön.

