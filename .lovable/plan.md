

# Plan: Systemtestplan + Användarhandledning

## Del 1: Skapa en komplett testplan (Markdown-fil)

Fil: `/mnt/documents/testplan.md`

Testplanen struktureras i testsviter som täcker alla systemfunktioner, grupperade per modul. Varje testfall har ID, beskrivning, förutsättningar, steg och förväntat resultat.

### Testsviter

**TS-01: Autentisering & sessionshantering**
- Inloggning med giltiga/ogiltiga uppgifter
- Tvingat lösenordsbyte (must_change_password)
- Lösenordsbyte via profil (validering, matchning)
- Utloggning och sessionsinvalidering
- JWT-token expiry-hantering

**TS-02: Rollbaserad åtkomstkontroll (RBAC)**
- Route guards: varje skyddad sida testas med obehörig roll via URL
- Sidebar: verifiera att menyval filtreras per roll
- Funktionsåtkomst: skapa/redigera/ta bort knappar visas/döljs korrekt
- Multi-roll: användare med flera roller ser kombinerade behörigheter

**TS-03: Användarhantering (Admin)**
- CRUD för användare (skapa, redigera, ta bort)
- Rolltilldelning (enkel och multi-roll)
- Entreprenör kräver kontaktperson
- Aktivera/inaktivera användare
- Sök, rollfilter, statusfilter, paginering
- Export till CSV

**TS-04: Anläggningshantering**
- Skapa/redigera/ta bort anläggning
- Tilldela ägare och administratörer
- Koppla krav till anläggning
- Rollbegränsning (bara admin/facility_owner/facility_admin)

**TS-05: Områdeshantering**
- Skapa/redigera/ta bort område kopplat till anläggning
- Säkerhetsnivå (låg/medel/hög/kritisk)
- Koppla områdesspecifika krav
- Visning av kravantal per område

**TS-06: Kravhantering**
- Skapa krav (utbildning/certifiering/säkerhetsprövning)
- Giltighetstid (permanent vs. tidsbegränsat)
- Redigera och ta bort krav
- Kravregistrering per användare med filbilaga (max 5 MB)
- Nedladdning av bilaga
- Utgångsstatus (fulfilled/expired/pending)

**TS-07: Ansökningsflöde (end-to-end)**
- Anställd skapar ansökan (väljer anläggning, områden, datum)
- Kravkontroll: anläggnings- och områdeskrav kombineras
- Saknade krav -> avsteg med motivering
- Linjechef godkänner (pending_manager -> pending_facility)
- Anläggningsägare/admin godkänner (pending_facility -> approved)
- Avsteg: bara facility_owner kan godkänna pending_exception
- Avslag med anledning
- Återkallande av beviljat tillträde (approved -> expired)
- Sök, statusfilter, paginering
- Export till CSV

**TS-08: Dashboard**
- Admin ser globala siffror och alla ansökningar
- Facility owner/admin ser egna anläggningars data
- Linjechef ser teamets statistik
- Anställd/Entreprenör ser egna ansökningar

**TS-09: Mitt team (Linjechef)**
- Lista underställda (rekursivt)
- Statistik: teammedlemmar, väntande, aktiva
- Skapa/redigera/ta bort teammedlem

**TS-10: Min åtkomst (Anställd/Entreprenör)**
- Kravuppfyllnad med progress
- Lista aktiva tillträden

**TS-11: Notifikationer**
- Automatiska notifikationer vid statusändringar
- Markera som läst (dropdown + helsidesvy)
- "Markera alla som lästa"
- E-postsimulering (toast)

**TS-12: Systemlogg**
- Alla CRUD-händelser loggas
- Visar aktör, tid, händelse, detaljer
- Export till CSV

**TS-13: Organisation**
- Trädstruktur (VD -> avdelningar -> medarbetare)
- Skapa/redigera/ta bort noder
- Koppla användare till nod

**TS-14: Inställningar**
- Allmänt, Krav (CRUD), Branding, Aviseringar, Autentisering
- Flikar fungerar korrekt

**TS-15: Profil**
- Visa personuppgifter, roller, chef
- Byt lösenord
- Kravuppfyllnad med progress

**TS-16: UI/UX**
- Tema: dark/light-toggle
- Sidebar: kollapsad vy visar avatar
- Responsivitet
- Toasts vid alla åtgärder

---

## Del 2: Skapa en komplett användarhandledning

Fil: `/mnt/documents/anvandarhandledning.md`

### Struktur

1. **Introduktion** - Systemöversikt, syfte, roller
2. **Komma igång** - Inloggning, lösenordsbyte, profil
3. **Roller och behörigheter** - Beskrivning av alla 6 roller och vad de kan göra
4. **Dashboard** - Vad varje roll ser
5. **Ansökningar** - Skapa, granska, godkänna, avslå, återkalla
6. **Anläggningar och områden** - Skapa, hantera krav, tilldela admins
7. **Krav och kvalifikationer** - Typer, giltighetstider, uppfyllnad, bilagor
8. **Användarhantering** - CRUD, roller, aktivering
9. **Mitt team** - Linjechefens vy
10. **Min åtkomst** - Anställds/Entreprenörs vy
11. **Organisation** - Trädstruktur
12. **Notifikationer** - Systemaviseringar
13. **Systemlogg** - Revisionslogg
14. **Inställningar** - Systemkonfiguration
15. **Export** - CSV-export av data

---

## Teknisk implementation

Skript som genererar två Markdown-filer till `/mnt/documents/`:
- `testplan.md` (~300 rader, strukturerade testfall med ID, steg, förväntat resultat)
- `anvandarhandledning.md` (~400 rader, steg-för-steg-instruktioner med skärmbilder-platshållare)

Allt körs som ett Python-skript som skriver filerna direkt.

