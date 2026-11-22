# GRIT DIGITAL CLUB - Roadmap

Status: **PREDLOG.** Vremenske procene se namerno ne daju dok se ne potvrde arhitektura, veličina tima i dostupnost podataka od vlasnika. Relativna veličina faza je data u "S/M/L/XL".

## 1. Zavisnosti modula

```
F1 Temelj (monorepo, DB, auth, uloge, RLS, design tokens, UI kit, CI)
 │
 ├──► F2 Admin: članovi, paketi, članarine, uplate, osnovni dashboard
 │      │
 │      ├──► F3 Mobile: auth, Home, Članstvo, Profil, sr/en
 │      │      │
 │      │      └──► F4 QR + Check-in ──────────────► ★ MVP (uz F5-osnovno)
 │      │
 │      └──► F5 Mapa + Oprema + Održavanje (nezavisno od F3/F4 u adminu)
 │
 ├──► F6 Treneri + Grupni + Rezervacije  (zahteva F3; koristi notifikacije iz F8a)
 ├──► F7 Workout + Progress               (zahteva F3, F5-oprema za vezu vežba↔sprava)
 ├──► F8 Notifikacije → Promocije/Lojalnost → ru/ar (RTL)
 ├──► F9 Kafić meni                        (zahteva F1; nezavisan)
 └──► F10 Hardening, testovi na uređajima, objava u prodavnicama
```

Napomena: **F8a (push infrastruktura)** se može izvući ispred F6, jer potvrda rezervacije i podsetnici zavise od nje.

## 2. Faze

| Faza      | Sadržaj                                                                                                                                                                                                                                                                        | Veličina | Izlazni kriterijum (Definition of Done)                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **F0**    | Analiza, dokumentacija (ovaj set)                                                                                                                                                                                                                                              | -        | Vlasnik/tim potvrdio arhitekturu i odluke iz §4                                                                           |
| **F1**    | Monorepo, CI, Supabase projekti, migracije (identitet, članovi, članarine, uplate, pristup, settings, audit), RLS + pgTAP, API skelet (auth middleware, permission guard, error handler, OpenAPI, logovanje), design tokens, UI kit (web + RN osnovne komponente), i18n skelet | L        | `pnpm lint typecheck test build` zelen u CI-ju; RLS testovi prolaze; `/health` na staging-u; Storybook/preview komponenti |
| **F2**    | Admin login (+MFA), članovi, paketi, članarine, uplate (storno/refund), dashboard v1, audit pregled, podešavanja/radno vreme                                                                                                                                                   | L        | Tokovi T1 i M3-M6, M11, M12 rade end-to-end na staging-u; Playwright E2E za T1                                            |
| **F3**    | Mobile: auth, povezivanje naloga, Home, Članstvo, kartica, Profil, podešavanja, brisanje naloga, sr/en                                                                                                                                                                         | L        | Radi na fizičkom iOS i Android uređaju (EAS internal build); nema hardkodiranih stringova                                 |
| **F4**    | QR token, validacija, ekran recepcije (USB skener + kamera), ručni check-in, override, izveštaj dolazaka                                                                                                                                                                       | M        | Svi testovi iz SECURITY §5, uključujući test paralelnog skena; p95 < 500 ms na staging-u                                  |
| **F5**    | Mapa (verzije, spratovi, prostorije), editor (Konva), prikaz u app (SVG), oprema, prijava kvara, održavanje                                                                                                                                                                    | L        | Objava mape ne gubi opremu (test); član vidi samo objavljenu verziju                                                      |
| **★ MVP** | F1-F4 + F5 osnovno + javni sajt v1                                                                                                                                                                                                                                             | -        | Pilot sa recepcijom i grupom članova ⚠️, zatim puštanje svima                                                             |
| **F6**    | Treneri, raspored, grupni treninzi, rezervacije, lista čekanja, PT zahtevi                                                                                                                                                                                                     | L        | Test konkurentnosti poslednjeg mesta; otkazivanje unapređuje listu čekanja                                                |
| **F7**    | Biblioteka vežbi, trening dnevnik (offline), istorija, PR, mere, ciljevi                                                                                                                                                                                                       | L        | Offline trening se sinhronizuje bez duplikata; privatnost (trener samo uz pristanak)                                      |
| **F8**    | Push/in-app, preferencije, automatizacije (pg-boss), promo kodovi, lojalnost, ru + ar/RTL                                                                                                                                                                                      | XL       | Bez duplih poruka (dedupe test); RTL vizuelna provera svih ekrana                                                         |
| **F9**    | Kafić: kategorije, proizvodi, alergeni, dostupnost, admin                                                                                                                                                                                                                      | M        | Meni u app i na sajtu iz istog izvora                                                                                     |
| **F10**   | Kompletno testiranje, performanse, restore test, store priprema (screenshots, privacy labels, data safety), objava                                                                                                                                                             | M        | Prošao App Store i Google Play review                                                                                     |

## 2a. Dopuna posle prototipa vlasnika (2026-11-17)

Posle F7 redosled je: **F8a Recepcija+** (odjava, „u teretani sada“, garderobe i ormarići) → **F7b** (plan treninga od trenera, InBody mere) → **F8** (notifikacije, centar upozorenja u adminu, promocije, loyalty, ar/RTL) → **F9** (kafić + inventar) → **F9b** (katalog usluga, udeo i zarada trenera) → **F10**. Detalji i otvorena pitanja: [PROTOTIP_ANALIZA.md](PROTOTIP_ANALIZA.md).

## 3. Predlog prve implementacione faze - F1 "Temelj" (Korak 10)

Cilj: **ništa vidljivo za člana, ali sve na čemu sve ostalo stoji radi i testirano je.**

**Redosled rada (svaki korak se završava zelenim CI-jem):**

1. **Priprema okruženja:** premestiti repo van OneDrive-a (R-01), `git init`, `corepack enable` (pnpm), instalirati Supabase CLI i (opciono) Docker Desktop. Kreirati Supabase projekte `grit-dev` i `grit-staging` (EU).
2. **Monorepo skelet:** pnpm workspaces + Turborepo, `packages/config` (tsconfig strict, ESLint, Prettier), prazni `apps/*` koji se build-uju, GitHub Actions CI.
3. **Baza, migracija 001-004:** ekstenzije (`citext`, `pg_trgm`, `btree_gist`), identitet i uloge, članovi i pristanci, paketi/članarine/uplate, pristup i dolasci, settings i audit. `set_updated_at` trigger i audit immutability trigger. Seed: uloge, dozvole i **DEMO** podaci sa prefiksom `[DEMO]`.
4. **RLS + pgTAP testovi** za sve tabele iz koraka 3 (član A/B, anon, immutability).
5. **API skelet:** Express app factory, JWT verifikacija (JWKS), `loadActor` (uloge i dozvole), `requirePermission`, zod validacija, error handler sa standardnim odgovorom, pino, rate limit, helmet/CORS, `withMemberTx` / `withStaffTx` helperi, OpenAPI generisanje, `/health` i `/ready`. Test "svaka admin ruta ima guard".
6. **Prvi vertikalni modul kao šablon - `members`:** routes → controller → service → repository → testovi (401/403/404/validacija/audit). Ostali moduli kasnije kopiraju ovaj obrazac.
7. **Design tokens + UI kit v0:** `tokens.json` → CSS vars, Tailwind preset i RN theme. Web: Button, Input, Select, Badge, Card, Table, Modal, Toast, Skeleton, EmptyState. RN: Button, Input, Card, Badge, BottomSheet, Skeleton.
8. **i18n skelet:** `packages/translations` (sr, en), i18next config deljen web/RN, ESLint pravilo protiv literal stringova u JSX-u.
9. **Dokumentacija:** ažurirati README (pokretanje), DATABASE.md (stvarne migracije), API.md (generisan), "Šta je urađeno / šta ostaje".

**Ne ulazi u F1:** ekrani admina osim login placeholder-a, mobilni ekrani osim "hello + tema + jezik", QR.

## 4. Odluke koje treba potvrditi pre F1

| #   | Odluka                                         | Preporuka                                 |
| --- | ---------------------------------------------- | ----------------------------------------- |
| D1  | Klijenti → samo API (ne direktno PostgREST)    | **Da** (ARCHITECTURE §2)                  |
| D2  | Kysely + SQL migracije (umesto Prisma/Drizzle) | **Da**                                    |
| D3  | Javni sajt u Astro-u (umesto Vite SPA)         | **Da**, zbog SEO-a i brzine               |
| D4  | Narandžasta: #E54E26 (logo) ili #FF6A00        | **#E54E26**                               |
| D5  | Tekst na primarnom dugmetu: tamni (AA)         | **Da**                                    |
| D6  | Recepcija: USB 2D skener kao primarni ulaz     | **Da** (oko 30-60 € po komadu ⚠️ okvirno) |
| D7  | Lokacija repoa van OneDrive-a                  | **Da**                                    |
| D8  | Supabase Pro za production (PITR backup)       | **Da**, pre puštanja članovima            |
