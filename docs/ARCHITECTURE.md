# GRIT DIGITAL CLUB - Arhitektura

Status: **PREDLOG (Faza 0) - čeka potvrdu vlasnika/tima**
Datum: 2026-11-16

---

## 0. Analiza postojećeg okruženja (Korak 1)

| Stavka                | Nalaz                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Repozitorijum         | Folder `Grit gym` je **prazan**. Nema postojećeg koda, baze, migracija ni API-ja. Nije git repozitorijum.                      |
| Node.js               | v22.19.0 ✔ (LTS, odgovara Expo/Vite/Express)                                                                                   |
| npm                   | 10.9.3 ✔                                                                                                                       |
| pnpm                  | **nije instaliran** → `corepack enable && corepack prepare pnpm@latest --activate`                                             |
| Git                   | 2.51 ✔ (repo treba inicijalizovati)                                                                                            |
| Supabase CLI          | **nije instaliran** (potreban za migracije i lokalni razvoj)                                                                   |
| Docker                | **nije instaliran** (potreban za lokalni Supabase stack; alternativa: razvoj direktno na Supabase _dev_ projektu)              |
| OS                    | Windows 10 - putanja projekta je u OneDrive folderu (vidi rizik R-01)                                                          |
| Brend                 | Dostavljen logo. Dominantna narandžasta u logou izmerena je kao **#E54E26**, a ne #FF6A00 (vidi DESIGN_SYSTEM.md §1).          |
| Instagram @gritgym.rs | Instagram ne dozvoljava automatsko čitanje sadržaja → fotografije i informacije moraju se dostaviti ručno (OPEN_QUESTIONS.md). |

**Zaključak:** gradimo od nule, pa nema rizika od brisanja postojećeg koda. Struktura iz master prompta se usvaja uz manje izmene koje su obrazložene ispod.

---

## 1. Zahtevi

### Funkcionalni (sažetak)

Detalji su u PRD.md. Jezgro MVP-a: članovi, članarine, uplate (evidencija), QR dolasci, admin panel, osnovna mapa i oprema, SR/EN.

### Nefunkcionalni

| Zahtev                  | Cilj                                                                            | Obrazloženje                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Obim                    | 1 objekat, reda veličine 10³ članova, < 2.000 dolazaka dnevno, < 50 zaposlenih  | Pretpostavka; treba potvrditi broj članova. Ovaj obim ne zahteva horizontalno skaliranje.     |
| Latencija QR validacije | p95 < 500 ms od skena do rezultata                                              | Red na recepciji je glavni UX rizik.                                                          |
| Dostupnost              | 99,5% u radnom vremenu                                                          | Mali tim i jedan objekat. Za ispad postoji dokumentovan ručni postupak (BUSINESS_RULES §4.6). |
| Bezbednost              | RLS na svim tabelama, provera dozvola na backendu, audit kritičnih operacija    | SECURITY.md                                                                                   |
| Privatnost              | Usklađenost sa ZZPL (Srbija) i GDPR principima                                  | Telesne mere su posebna kategorija podataka i traže izričit pristanak.                        |
| Jezici                  | sr (podrazumevani), en, ru, ar (RTL)                                            | MVP: sr + en                                                                                  |
| Offline                 | Čitanje keširanog sadržaja i lokalni nedovršeni trening; **nikad** offline ulaz | §7                                                                                            |

### Ograničenja

- Mali razvojni tim → **modularni monolit**, bez mikroservisa.
- Jedan brend i jedan objekat → nema multi-tenancy. Kolona `location_id` se uvodi tek kada zatreba druga lokacija (vidi §9).
- Fiskalizacija je van sistema (evidencija uplata nije fiskalni račun).

---

## 2. Pregled sistema (Korak 9)

```
 ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
 │  Mobilna app     │   │  Admin panel     │   │  Javni sajt      │
 │  Expo / RN (TS)  │   │  React+Vite (TS) │   │  Astro (+React)  │
 │  članovi         │   │  zaposleni       │   │  gosti           │
 └───────┬──────────┘   └───────┬──────────┘   └───────┬──────────┘
         │ ① Auth (login, refresh, MFA)                │ javni GET
         ├──────────────────────┐                      │ (keširano, CDN)
         ▼                      ▼                      ▼
 ┌──────────────────┐   ┌─────────────────────────────────────────┐
 │  Supabase Auth   │   │        GRIT API (Express, TS)           │
 │  (JWT izdavač)   │◄──┤  /v1/...  modularni monolit             │
 └──────────────────┘ ② │  auth middleware → permission guard →   │
                 JWKS   │  zod validacija → service → repository  │
                        │  + worker (pg-boss): notifikacije, cron │
                        └───────┬──────────────────────┬──────────┘
                                │ ③ SQL (Kysely)       │ ④ potpisani URL-ovi
                                ▼                      ▼
                        ┌────────────────┐     ┌────────────────┐
                        │  PostgreSQL    │     │ Supabase       │
                        │  (Supabase)    │     │ Storage        │
                        │  RLS uključen  │     │ public/private │
                        └────────────────┘     └────────────────┘
                                ▲
             Expo Push / Resend ┘ (izlazni pozivi iz worker-a)
```

### Kako aplikacije komuniciraju

1. **Autentifikacija** - klijenti koriste `@supabase/supabase-js` **samo za Auth** (prijava, refresh, MFA, reset lozinke). Dobijaju JWT (access token).
2. **Svi poslovni podaci idu preko GRIT API-ja.** Klijent šalje `Authorization: Bearer <supabase JWT>`. API verifikuje potpis preko Supabase JWKS-a, učitava ulogu i dozvole korisnika iz baze, pa izvršava zahtev.
3. **Klijenti nikada ne čitaju i ne pišu tabele direktno** preko PostgREST-a. RLS je ipak uključen na svim tabelama kao druga linija odbrane (SECURITY.md §3), a `anon` i `authenticated` nemaju direktne grant-ove na poslovne tabele.
4. **Fajlovi** - API izdaje potpisane upload/download URL-ove za Supabase Storage. Javne slike (oprema, kafić, treneri) idu iz public bucket-a preko CDN-a, a privatne (fotografije napretka) iz private bucket-a sa kratkim rokom važenja.
5. **Javni sajt** se generiše statički (Astro). Sadržaj povlači iz javnih API endpointa pri build-u, a promene iz admina pokreću rebuild preko webhook-a. Radno vreme i promocije mogu se dopuniti runtime fetch-om.
6. **Asinhroni poslovi** (push, email, podsetnici, isticanje članarina) idu kroz **pg-boss** red u Postgres-u. Nema dodatne infrastrukture (Redis i slično).

### Zašto API kao jedina ulazna tačka (a ne direktan Supabase iz klijenta)

| Opcija                                                | Prednost                                                                                                     | Mana                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **A. Sve preko API-ja (izabrano)**                    | Jedno mesto za poslovna pravila, audit, rate limit, transakcije (QR, rezervacije, uplate). Lakše testiranje. | Više koda u API-ju; dodatni skok mreže.                                        |
| B. Klijent → PostgREST + RLS, API samo za "osetljivo" | Manje backend koda                                                                                           | Logika se deli između RLS-a i API-ja; teško je garantovati doslednost i audit. |

Master prompt traži da poslovne operacije budu kontrolisane na serveru. Opcija A to ispunjava bez izuzetaka.

---

## 3. Backend - modularni monolit

### Slojevi po modulu

```
modules/memberships/
├── memberships.routes.ts       # Express router, deklarativne dozvole po ruti
├── memberships.controller.ts   # HTTP ↔ service mapiranje, bez logike
├── memberships.service.ts      # poslovna pravila, transakcije, audit
├── memberships.repository.ts   # Kysely upiti
├── memberships.schemas.ts      # re-export iz @grit/validation (zod)
├── memberships.types.ts
└── __tests__/
```

**Pravila zavisnosti:** modul A sme da koristi samo **service** modula B, nikad njegov repository. Kružne zavisnosti nisu dozvoljene; proverava ih `eslint-plugin-boundaries` ili `dependency-cruiser` u CI-ju.

### Ključne tehničke odluke

| Odluka       | Izbor                                                                                   | Obrazloženje / alternativa                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Pristup bazi | **Kysely** + `kysely-codegen` (tipovi iz baze)                                          | SQL migracije ostaju jedini izvor istine. Drizzle bi uveo drugi izvor šeme. Prisma loše radi sa RLS-om, `SET LOCAL` i Supabase pooler-om. |
| Migracije    | **Supabase CLI** (`supabase/migrations/*.sql`)                                          | Postgres-native: RLS, funkcije, triggeri, constraint-i.                                                                                   |
| Validacija   | **zod** šeme u `packages/validation`, iste na klijentu i serveru                        | Bez dupliranja.                                                                                                                           |
| OpenAPI      | `@asteasolutions/zod-to-openapi`                                                        | Dokumentacija se generiše iz istih zod šema.                                                                                              |
| Poslovi/cron | **pg-boss**                                                                             | Koristi postojeći Postgres i podržava zakazivanje, singleton ključeve (anti-duplikat) i retry.                                            |
| Logovanje    | **pino** (JSON) + request-id                                                            | Render log stream; Sentry za greške.                                                                                                      |
| Rate limit   | `express-rate-limit` + Postgres store                                                   | Bez Redis-a. Dovoljno za jednu instancu, a store u Postgres-u radi i sa više instanci.                                                    |
| Vreme        | Svi timestamp-ovi su `timestamptz` (UTC). Poslovni "dan" se računa u `Europe/Belgrade`. | Isticanje članarine "do kraja dana" zavisi od vremenske zone.                                                                             |
| Novac        | `integer` u **para** (minor units) + `currency char(3)`                                 | Bez float grešaka.                                                                                                                        |

### Dva režima pristupa bazi iz API-ja

1. **Member-scoped transakcija** (endpointi `/v1/me/...`): API otvara transakciju i postavlja `SET LOCAL role authenticated` i `SET LOCAL request.jwt.claims = '<claims>'`. **RLS tada važi i za API.** Ako API ima bug u WHERE uslovu, član i dalje ne može da dobije tuđe podatke.
2. **Staff transakcija** (endpointi `/v1/admin/...`): koristi se privilegovana veza. Autorizacija ide kroz `requirePermission('members.read')` guard, a svaka mutacija upisuje audit zapis u istoj transakciji.

---

## 4. Monorepo struktura (konačan predlog)

```
grit-digital-club/
├── apps/
│   ├── mobile/          Expo (Expo Router) - članovi
│   ├── admin/           React + Vite + Tailwind - zaposleni (uklj. QR skener recepcije)
│   ├── website/         Astro + React islands + Tailwind - javni sajt
│   └── api/             Express + TS + pg-boss worker
├── packages/
│   ├── types/           Generisani DB tipovi + domenski tipovi (DTO)
│   ├── validation/      zod šeme (request/response)
│   ├── api-client/      Tipiziran fetch klijent + TanStack Query ključevi/hook fabrike
│   ├── business-logic/  ČISTE funkcije bez I/O (npr. formatiranje statusa, računanje datuma)
│   ├── translations/    sr/ en/ ru/ ar/ (JSON po namespace-u) + i18next config
│   ├── design-tokens/   tokens.json → CSS vars (web), TS objekat (RN), Tailwind preset
│   ├── ui-web/          Deljene React komponente za admin + website (dodato)
│   ├── config/          eslint, tsconfig, prettier preseti (dodato)
│   └── utils/
├── supabase/
│   ├── migrations/
│   ├── seed/            dev seed: SAMO jasno označeni DEMO podaci
│   └── tests/           pgTAP testovi za RLS
├── docs/
├── .github/workflows/   CI: lint, typecheck, test, build, RLS testovi
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

**Izmene u odnosu na master prompt:**

- Dodati su `packages/ui-web` (admin i sajt dele komponente) i `packages/config` (jedan ESLint/TS standard).
- `apps/mobile/navigation/` je izbačen. Expo Router koristi `app/` direktorijum kao navigaciju, pa bi poseban folder bio dupliran koncept.
- `business-logic` sadrži samo čiste funkcije za prikaz i računanje. **Autoritativni status članarine računa backend** (vidi BUSINESS_RULES §2), da se klijent i server nikad ne bi razišli.

### Napomena za Expo u monorepou

Expo SDK 52+ podržava pnpm monorepo, ali se `node-linker=hoisted` u `.npmrc` preporučuje radi stabilnosti native modula. Svi RN paketi se instaliraju preko `npx expo install` da bi verzije bile usklađene sa SDK-om. **Verzije se pinuju pri inicijalizaciji** na tada aktuelni stabilni Expo SDK; ništa se ne kombinuje nasumično.

---

## 5. Mobilna aplikacija - arhitektura

```
apps/mobile/
├── app/                      Expo Router
│   ├── (auth)/ login, register, forgot-password, link-membership
│   ├── (tabs)/ index(Home), explore, workouts, membership, profile
│   ├── card.tsx              fullscreen QR (modal ruta, max osvetljenje)
│   └── _layout.tsx           providers: QueryClient, i18n, theme, auth gate
├── features/<domen>/         components + hooks + screens po domenu
├── components/ui/            dizajn sistem (RN)
├── services/                 supabase auth, secure storage, push registracija
├── stores/                   zustand: session, preferences, workout-draft
└── theme/                    iz @grit/design-tokens
```

- **Bottom tabs (5):** Početna · Istraži · Trening · Članstvo · Profil. QR kartica je dostupna sa svakog ekrana preko istaknutog dugmeta na Početnoj i u Članstvu, kao i preko long-press-a na tab "Članstvo".
- **Sesija:** refresh token se čuva u `expo-secure-store` (Keychain/Keystore), nikad u AsyncStorage.
- **Server state:** TanStack Query + `persistQueryClient` (MMKV) za offline čitanje javnog sadržaja.
- **Client state:** zustand (sesija, jezik, nacrt treninga).

## 6. Admin panel - arhitektura

- React Router sa layout rutama i guard-om po dozvoli. Meni se generiše iz dozvola, ali **backend uvek proverava ponovo**.
- **Recepcija / Check-in ekran** podržava dva ulaza:
  1. **USB/BT ručni skener** (radi kao tastatura): fokusirano input polje, Enter šalje token. Ovo je najpouzdanija opcija i preporuka za recepciju.
  2. **Kamera** (tablet/laptop): `BarcodeDetector` API sa fallback-om na `@zxing/browser`.
- Map editor: **React Konva** (drag, resize, transform, snap-to-grid). Mobilna app prikazuje objavljenu mapu kao **SVG** (`react-native-svg`) iz istih podataka.

## 7. Offline strategija

| Podatak                            | Offline                                                   | Mehanizam                                                                                                            |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Info o GRIT-u, mapa, oprema, vežbe | čitanje                                                   | Query cache persist (MMKV), `stale-while-revalidate`                                                                 |
| Nedovršeni trening                 | čitanje + pisanje                                         | zustand + MMKV. Svaka serija ima `client_id` (UUID v7), a sync je idempotentan upsert.                               |
| Članarina / status                 | samo poslednje viđeno, uz oznaku "Poslednje ažurirano: …" | Nikad se ne prikazuje kao trenutno stanje bez te oznake                                                              |
| **QR kod**                         | **NE**                                                    | Token važi 60 s i izdaje ga samo server. Bez mreže se prikazuje stanje "Potrebna je internet veza za pristupni kod". |

Konflikti: serverski `updated_at` pobeđuje za zajedničke entitete. Trening sesije su append-only, pa se serije ne prepisuju, nego dodaju sa dedup-om po `client_id`.

## 8. Infrastruktura i okruženja

| Komponenta   | Dev                                         | Staging                    | Production                                                   |
| ------------ | ------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| Supabase     | `grit-dev` projekat (ili lokalno uz Docker) | `grit-staging`             | `grit-prod`, **EU region (Frankfurt)**                       |
| API + worker | lokalno                                     | Render (free/starter)      | Render (2 servisa: web + worker)                             |
| Admin        | lokalno                                     | Cloudflare Pages (preview) | Cloudflare Pages + Cloudflare Access (opciono, dodatni sloj) |
| Website      | lokalno                                     | Cloudflare Pages preview   | Cloudflare Pages                                             |
| Mobile       | Expo Go / dev client                        | EAS internal distribution  | EAS → App Store / Google Play (nalozi u vlasništvu GRIT-a)   |
| Greške       | -                                           | Sentry                     | Sentry                                                       |
| Backup       | -                                           | Supabase dnevni            | Supabase PITR (Pro plan) + **mesečni test restore-a**        |

Tajne se čuvaju u Render, Cloudflare i EAS secrets. U git ide samo `.env.example`.

## 9. Proširivost na više lokacija (bez preranog SaaS-a)

- Sve tabele vezane za objekat (`floors`, `rooms`, `equipment`, `classes`, `attendance`) dobijaju `location_id` **tek kada zatreba**. Migracija je mehanička: dodaje se kolona sa default vrednošću za postojeću lokaciju.
- Pristup bazi je već centralizovan kroz repository sloj, pa filtriranje po lokaciji ide na jedno mesto.
- Ništa od ovoga se ne gradi u MVP-u.

## 10. Rizici

| ID   | Rizik                                                                                                  | Uticaj            | Mitigacija                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Projekat je u OneDrive folderu, a sinhronizacija `node_modules` pravi zaključavanja fajlova i spor rad | Visok (DX)        | Premestiti repo van OneDrive-a (npr. `C:\dev\grit-digital-club`) ili isključiti sync za folder. **Preporuka pre Faze 1.** |
| R-02 | Nedostaju stvarni poslovni podaci (paketi, cene, plan objekta)                                         | Visok             | Gradimo strukture, praznа stanja i jasno označen DEMO seed (OPEN_QUESTIONS.md).                                           |
| R-03 | Arapski RTL u RN zahteva restart aplikacije (`I18nManager.forceRTL`)                                   | Srednji           | Promena na/sa arapskog prikazuje dijalog i radi `Updates.reloadAsync()`. Testirati od Faze 3.                             |
| R-04 | Pad interneta ili API-ja na recepciji                                                                  | Visok (operativa) | Dokumentovana ručna procedura sa papirnom/offline listom. API health monitoring.                                          |
| R-05 | Supabase free plan pauzira neaktivne projekte i nema PITR                                              | Srednji           | Production na Pro planu.                                                                                                  |
| R-06 | Apple review: app sa nalozima mora podržati brisanje naloga u aplikaciji                               | Srednji           | Ugrađeno u Profil (Faza 3).                                                                                               |
| R-07 | Boja iz master prompta (#FF6A00) se razlikuje od boje u logou (#E54E26)                                | Nizak             | Odluka vlasnika (DESIGN_SYSTEM §1).                                                                                       |
| R-08 | Nema Docker-a ni Supabase CLI-ja na mašini                                                             | Nizak             | Instalirati, ili razvijati na Supabase dev projektu u cloud-u.                                                            |

## 11. Šta bi se revidiralo kako sistem raste

- Više od jedne API instance → rate-limit store i pg-boss već rade, pa treba proveriti samo pooler konekcije (Supavisor, transaction mode).
- Analitika na velikom broju dolazaka → materijalizovani pogledi ili dnevni rollup tabele.
- Fizička kontrola pristupa (vrata) → poseban `access-controller` adapter u modulu `access`. Model tokena je već kompatibilan.
