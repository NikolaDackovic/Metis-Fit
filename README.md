# GRIT DIGITAL CLUB

Digitalni sistem za GRIT GYM: mobilna aplikacija za članove (iOS/Android), administrativni panel, javni sajt i zajednički backend.

**Stanje:** Faze 1-7 i F8a su završene (temelj, admin, mobilna aplikacija, QR ulaz, mapa i oprema, treneri i grupni treninzi, dnevnik treninga i napredak, odjava i ormarići). F7b (plan treninga od trenera, InBody, plan ishrane uz AI) je završena. Sledi F8 (notifikacije, upozorenja u adminu, promocije, loyalty, arapski/RTL), vidi [docs/PROTOTIP_ANALIZA.md](docs/PROTOTIP_ANALIZA.md). Detalji su u [docs/PROGRESS.md](docs/PROGRESS.md).

## Brzi start (lokalno, bez Supabase-a i Docker-a)

Potrebno: Node.js 22+, pnpm 10 (`npm i -g pnpm@10`).

```sh
pnpm install
pnpm check            # lint + typecheck + testovi + build (sve mora biti zeleno)

# tri terminala:
pnpm db:dev           # lokalni Postgres 127.0.0.1:54322 + provizorni podaci + dev nalozi
pnpm dev:api          # API na http://localhost:4000 (OpenAPI: /v1/openapi.json)
pnpm dev:admin        # Admin na http://localhost:5180 → „DEV prijava“
pnpm dev:mobile       # Expo (web: taster w) → dev član clan@grit.local
```

Dev nalozi: `vlasnik@grit.local`, `menadzer@grit.local`, `recepcija@grit.local`. DEV prijava postoji samo kada je `NODE_ENV=development`. API odbija da se pokrene sa `DEV_LOGIN=true` u bilo kom drugom okruženju.
`apps/api/.env` i `apps/admin/.env.local` za lokalni rad nisu u git-u; šabloni su u `.env.example`. Novu bazu dobijaš sa `pnpm db:dev -- --reset`.

## Struktura

```
apps/api                 Express API (modularni monolit)
apps/admin               Admin panel (React + Vite + Tailwind)
apps/mobile              Mobilna aplikacija za članove (Expo SDK 58 / React Native)
packages/database        Kysely tipovi, test Postgres (bez Docker-a), RLS testovi
packages/validation      zod šeme i DTO-i, deljeni između API-ja i klijenata
packages/translations    sr / en / ru (ar u fazi 8), i18next + formatiranje novca
packages/design-tokens   GRIT boje, tipografija, razmaci → TS i CSS (Tailwind v4)
supabase/migrations      jedini izvor istine za šemu baze
assets/brand             zvanični logo
docs/                    PRD, arhitektura, baza, API, bezbednost, dizajn, odluke, roadmap
```

## Dokumentacija

| Dokument                                         | Sadržaj                                                     |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [docs/PROGRESS.md](docs/PROGRESS.md)             | **Šta je urađeno**, testovi, odstupanja, poznati problemi   |
| [docs/DECISIONS.md](docs/DECISIONS.md)           | Važeće odluke, poznati podaci o GRIT-u, provizorni cenovnik |
| [docs/PRD.md](docs/PRD.md)                       | Obim MVP-a i kriterijumi prihvatanja                        |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Komponente, komunikacija, rizici                            |
| [docs/DATABASE.md](docs/DATABASE.md)             | Model podataka i RLS (migracije su autoritativne)           |
| [docs/API.md](docs/API.md)                       | REST ugovor                                                 |
| [docs/SECURITY.md](docs/SECURITY.md)             | Pretnje, QR token, privatnost                               |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Statusi članarine, dolasci, uplate                          |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)   | Vizuelni identitet i komponente                             |
| [docs/ROADMAP.md](docs/ROADMAP.md)               | Faze i zavisnosti                                           |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Podaci koje vlasnik može da dopuni                          |

Brend: narandžasta `#E54E26`, fontovi Syncopate (naslovi) + Montserrat (tekst).
