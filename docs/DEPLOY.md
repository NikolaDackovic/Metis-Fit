# GRIT DIGITAL CLUB - Objava (F10)

Ovaj dokument opisuje kako se sistem pušta u rad. Hosting i nalozi još nisu izabrani: kada vlasnik izabere hosting, popunjavaju se samo vrednosti promenljivih, a kod se ne menja.

## 1. Delovi sistema

| Deo                   | Šta je                                                              | Gde može da radi                             |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Baza i prijava        | Supabase projekat (Postgres, Auth, Storage), region EU              | supabase.com (staging + production projekat) |
| API                   | Docker image `apps/api/Dockerfile`, port 4000, `/health` i `/ready` | Render, Fly.io, Railway, VPS sa Docker-om    |
| Admin                 | Statički fajlovi (`apps/admin/dist`), SPA                           | Cloudflare Pages, Netlify, Vercel            |
| Aplikacija za članove | iOS i Android preko EAS build-a; web verzija kao statički fajlovi   | App Store, Google Play; web isto kao admin   |

## 2. Supabase (jednom po okruženju)

1. Napraviti projekat (EU region). Uključiti **asymmetric JWT signing keys** (API proverava tokene preko JWKS).
2. Primeniti migracije: `supabase link --project-ref <ref>` pa `supabase db push` (fajlovi iz `supabase/migrations`).
3. Storage: napraviti **javni** bucket `club-media` (slike kluba, artikli kafića, profilne slike). Upis radi samo API sa service-role ključem.
4. Auth: email potvrda uključena, MFA (TOTP) uključen, URL za preusmeravanje = adresa admina i šema aplikacije `grit://`.
5. Prvi vlasnik: posle prve registracije, jednom u SQL editoru dodeliti ulogu `owner` tom nalogu (ostale zaposlene vlasnik dodaje iz admina).

## 3. API

Build (iz korena repozitorijuma): `docker build -f apps/api/Dockerfile -t grit-api .`

Obavezne promenljive (pun spisak i objašnjenja u `apps/api/.env.example`):

| Promenljiva                    | Vrednost                                           |
| ------------------------------ | -------------------------------------------------- |
| `NODE_ENV`                     | `production` (ili `staging`)                       |
| `DATABASE_URL`                 | Supabase connection string (session mode)          |
| `SUPABASE_URL`                 | `https://<ref>.supabase.co`                        |
| `SUPABASE_SERVICE_ROLE_KEY`    | samo na serveru (pozivnice osoblja, upis slika)    |
| `CORS_ORIGINS`                 | `https://` adrese admina i sajta, odvojene zarezom |
| `QR_TOKEN_SECRET`              | nasumičnih 32+ znaka                               |
| `MEDIA_STORE` / `MEDIA_BUCKET` | `supabase` / `club-media`                          |
| `STAFF_INVITE_REDIRECT_URL`    | adresa admina                                      |
| `CAFE_POS_SECRET`              | ako se koristi veza sa kasom                       |
| `PUSH_PROVIDER`                | `expo` kada postoji EAS build                      |

API **odbija da se pokrene** ako u produkciji: nema `SUPABASE_URL`, CORS nije `https://`, slike nisu u Storage-u, MFA za admin je isključen ili je uključen DEV login. Tajne se nikad ne stavljaju u image, admin ni aplikaciju.

Provera posle objave: `GET /health` → `ok`, `GET /ready` → `ready` (baza odgovara). `/v1/openapi.json` u produkciji ne postoji.

Ako radi više API instanci, `NOTIFICATION_JOBS=true` samo na jednoj.

## 4. Admin

```sh
VITE_API_URL=https://api.<domen>/v1 VITE_AUTH_MODE=supabase \
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon> \
VITE_MEMBER_APP_URL=https://app.<domen> pnpm --filter @grit/admin build
```

Objaviti `apps/admin/dist`. Fajlovi `_headers` (bezbednosna zaglavlja, keš) i `_redirects` (SPA) već su u build-u za Cloudflare Pages i Netlify.

## 5. Javni sajt

```sh
PUBLIC_API_URL=https://api.<domen>/v1 PUBLIC_MEMBER_APP_URL=https://app.<domen> PUBLIC_SITE_URL=https://<domen> pnpm --filter @grit/web build
```

Objaviti `apps/web/dist` kao statički sajt (više strana, **ne** SPA preusmeravanje). Adresu sajta dodati u `CORS_ORIGINS` API-ja.

## 6. Aplikacija za članove

1. `eas init` (Expo nalog kluba), u `app.json` ostaju `rs.gritgym.app` [PROVIZORNO, potvrditi naziv paketa pre prve objave].
2. EAS promenljive: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (javne vrednosti, bez tajni).
3. `eas build --profile preview` za testiranje na telefonima, zatim `eas build --profile production` i `eas submit`.
4. Za prodavnice su potrebni: Apple Developer i Google Play nalog kluba, politika privatnosti na sajtu, privacy labels / data safety (podaci: ime, email, telefon, datum rođenja, dolasci, treninzi; bez praćenja i bez prodaje podataka), snimci ekrana.

## 7. Pre puštanja (provera)

- [ ] `pnpm check` zelen u CI-ju, Docker image se build-uje
- [ ] Migracije primenjene na staging, test prijava, MFA vlasnika, QR ulaz, uplata, kafić
- [ ] Rezervna kopija baze uključena (Supabase PITR ili dnevni backup) i **probno vraćanje** urađeno na staging
- [ ] Prvi vlasnik ima MFA; zaposleni dodati pozivnicom
- [ ] Podaci označeni `[PROVIZORNO]` (cene, radno vreme, nagrade) potvrđeni ili izmenjeni u adminu
- [ ] Demo podaci (`[DEMO]`) ne postoje u produkciji (seed se pokreće samo lokalno)
