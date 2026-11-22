# GRIT DIGITAL CLUB - Bezbednost i privatnost

Status: **PREDLOG.** Važi od Faze 1. Nijedna faza se ne završava dok njeni bezbednosni testovi ne prolaze.

## 1. Model pretnji (sažetak)

| Pretnja                              | Primer                                | Kontrola                                                                                                           |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Član čita tuđe podatke (IDOR)        | `GET /me/memberships/<tuđi id>`       | `/me` rute ne primaju `memberId`, nego koriste identitet iz JWT-a. RLS-scoped transakcija. Odgovor je 404, ne 403. |
| Lažni ili ponovljeni QR              | screenshot QR-a poslat prijatelju     | Rok od 60 s, jednokratan `jti`, atomičan `UPDATE … WHERE consumed_at IS NULL`                                      |
| Falsifikovan QR                      | ručno napravljen token                | HMAC-SHA256 potpis, `kid` rotacija ključeva, a nepoznat `jti` se odbija                                            |
| Eskalacija privilegija               | član menja svoju ulogu                | Uloge se dodeljuju samo kroz API sa `staff.manage`. `user_roles` nema politike za `authenticated`.                 |
| Zaposleni zloupotrebljava ovlašćenja | lažni override ulaza, brisanje uplate | Dozvole po akciji, append-only audit log, uplate se ne brišu (samo storno)                                         |
| Brute-force                          | login, link kod, QR validacija        | Rate limit (§6), Supabase Auth zaštite, hash kodova                                                                |
| Curenje ključeva                     | service role u mobilnoj app           | Service role ključ postoji **samo** u API okruženju na Render-u. CI proverava build artefakte.                     |
| Curenje privatnih fotografija        | javni URL fotografije napretka        | Privatni bucket, potpisani URL od 60-300 s, putanja sadrži nasumičan UUID                                          |
| XSS/CSRF u adminu                    | maliciozan tekst u napomeni           | React escaping, CSP, Bearer token (ne cookie) → nema CSRF vektora, bez `dangerouslySetInnerHTML`                   |

## 2. Autentifikacija

- Supabase Auth (email + lozinka). Lozinka ima najmanje 10 karaktera, a uključena je provera procurelih lozinki (HIBP).
- Verifikacija email-a je obavezna pre povezivanja sa članskim profilom.
- **MFA (TOTP) je obavezan za `owner` i `manager`.** API odbija `/admin/*` zahteve tih uloga ako JWT nema `aal = aal2` (`MFA_REQUIRED`). ⚠️ Predlog: MFA i za `reception` na deljenim računarima → alternativno, recepcija koristi lične naloge sa kratkom sesijom.
- Mobilna sesija: refresh token je u `expo-secure-store`. Admin: access token u memoriji, a refresh u `sessionStorage` (sesija se prekida zatvaranjem taba) ⚠️.
- Svaki zaposleni ima **sopstveni nalog**. Deljeni nalog "recepcija" nije dozvoljen (zbog audita).

## 3. Autorizacija i RLS

- **Backend je jedini autoritet.** Frontend skriva dugmad samo zbog UX-a.
- Guard na svakoj admin ruti: `requirePermission('payments.void')`. Ruta bez deklarisane dozvole **pada na testu** (test prolazi kroz sve registrovane rute i proverava da li imaju guard).
- RLS je uključen na svim tabelama u `public`. `anon` i `authenticated` nemaju grant-ove na tabele osim onih navedenih u DATABASE.md §9.
- **pgTAP testovi** (`supabase/tests/rls/*.sql`) za svaku tabelu pokrivaju:
  - `anon`: select/insert/update/delete → odbijeno (osim javnog sadržaja);
  - član A: vidi svoje, **ne vidi** podatke člana B (select vraća 0 redova; update/delete pogađa 0 redova);
  - član ne može da menja `state`, `end_date`, `visits_used`, uloge;
  - `audit_logs`: UPDATE i DELETE podižu grešku za sve uloge.
- API integracioni testovi (Vitest + Supertest nad test bazom) za svaki endpoint: bez tokena → 401, pogrešna uloga → 403, tuđi resurs → 404.

## 4. Audit log

Upisuje se **u istoj transakciji** kao i promena. Obavezno za:
kreiranje/izmenu/deaktivaciju člana, dodelu/otkaz/pauzu članarine, svaku uplatu/storno/refund, ručni ulaz i override, promenu uloga i dozvola, promenu podešavanja i cena, objavu mape, izvoz podataka i brisanje naloga.
`diff` beleži samo promenjena polja. Ne beleže se lozinke, tokeni ni puni sadržaj fotografija.

## 5. QR pristupni token - specifikacija

**Format:** `g1.<jti_b64url>.<sig_b64url>`

- `jti`: 16 nasumičnih bajtova (UUID v4) → upisan u `access_tokens` sa `member_id` i `expires_at = now() + 60s`.
- `sig = HMAC-SHA256(key[kid], "g1." + jti)`, skraćen na 16 bajtova. `kid` je deo prefiksa verzije (`g1` = ključ 1), što omogućava rotaciju.
- **QR ne sadrži nikakve lične podatke**, pa čak ni ID člana. Sadrži samo nasumičan identifikator i potpis. Ukupna dužina je oko 50 karaktera, što daje mali i lako čitljiv QR.

**Validacija (`POST /admin/access/validate`):**

1. Format i potpis (constant-time poređenje). Ako ne valja → `TOKEN_INVALID`, bez upita na `access_tokens`.
2. Atomično trošenje tokena (`UPDATE … RETURNING`, DATABASE.md §5). Ako nema reda → utvrdi razlog: `TOKEN_EXPIRED` ili `TOKEN_REUSED`.
3. `SELECT … FOR UPDATE` nad važećim članarinama člana → primena pravila iz BUSINESS_RULES §4.
4. Upis u `attendance_attempts`, eventualno `visits_used++`, i audit.
5. Sve u jednoj transakciji. Uz `Idempotency-Key` (dvostruki sken istog QR-a za 2 s) vraća se **prvi** rezultat umesto `TOKEN_REUSED`.

**Testovi (obavezni, Faza 4):** važeći token prolazi; istekao ne prolazi; ponovljen ne prolazi; izmenjen potpis ne prolazi; token izdat pre isteka članarine, a skeniran posle, ne prolazi; **dva paralelna skena istog tokena → tačno jedan `granted`**; član bez važeće članarine ne dobija token; svaki pokušaj ima zapis.

### 5a. Rezervni QR bez interneta (F11-4, 2026-11-20)

- Dok je telefon na mreži, aplikacija od servera dobija **jedan** rezervni token (`POST /me/access-token/offline`, `access_tokens.kind = 'offline'`), isti format `g1.<jti>.<sig>`. Važi `access.offline_pass_hours` (podrazumevano 12 h, najviše 48 h).
- Čuva se u Keychain / Keystore (expo-secure-store), vezan za nalog; briše se pri odjavi.
- Prikazuje se **samo** kad živi 60-sekundni kod ne može da se preuzme (nema mreže). Aplikacija nikad sama ne pravi kod.
- Recepcija je na mreži, pa važi isto kao za živi kod: potpis, istek i **atomično jednokratno trošenje**. Novi rezervni kod briše prethodni neiskorišćen, pa član nikad nema više od jednog.
- Rizik: snimak ekrana rezervnog koda je upotrebljiv jednom, do isteka. Recepcija na skeniranju vidi ime člana; kod koji je prikazan aplikacija zamenjuje čim se vrati internet.

## 6. Rate limiting

| Ruta                             | Limit                                                    |
| -------------------------------- | -------------------------------------------------------- |
| Supabase Auth login/signup/reset | podrazumevani limiti Supabase-a (podesiti u dashboard-u) |
| `POST /me/access-token`          | 10/min po korisniku                                      |
| `POST /me/link`                  | 5 / 15 min po korisniku, 20/h po IP                      |
| `POST /admin/access/validate`    | 60/min po terminalu                                      |
| `POST /public/contact`           | 5/h po IP                                                |
| ostalo                           | 300/min po korisniku                                     |

## 7. Fajlovi

- Bucket-i: `public-media` (oprema, prostor, treneri, kafić), `member-private` (avatar, napredak, prijave kvara).
- Upload ide isključivo preko potpisanog URL-a koji izdaje API, sa MIME whitelist-om (`image/jpeg|png|webp`, PDF za uputstva), limitom 5 MB (10 MB za PDF) i putanjom koju generiše server.
- Posle upload-a API proverava stvarni MIME (magic bytes) i uklanja EXIF metapodatke (GPS!) sa fotografija članova.

## 8. Privatnost (ZZPL / GDPR principi)

- **Minimizacija:** datum rođenja je opcion (potreban samo za rođendanske ponude, uz pristanak). JMBG se ne prikuplja.
- **Posebna kategorija:** telesne mere i fotografije napretka zahtevaju izričit, odvojen pristanak koji se može povući.
- **Prava člana:** izvoz podataka (JSON + CSV, asinhrono) i brisanje (anonimizacija ličnih polja; finansijski zapisi ostaju anonimizovani).
- **Rok čuvanja** ⚠️ POTVRDITI sa pravnikom: `attendance_attempts` 24 meseca, `access_tokens` 24 h, `audit_logs` 5 godina.
- Politika privatnosti i uslovi korišćenja moraju postojati pre objave u prodavnicama. **Pravni tekst piše pravnik, ne razvojni tim.**
- Region podataka: Supabase **EU (Frankfurt)**.

## 9. Operativa

- Tajne su samo u secret menadžerima platformi. `.env*` je u `.gitignore`. CI pokreće secret scanning (gitleaks).
- Zavisnosti: `pnpm audit` u CI-ju i Renovate za ažuriranja.
- HTTP: `helmet`, CORS whitelist (admin, website i Expo dev domeni), HSTS, CSP na admin i sajtu.
- Backup: Supabase PITR (production). **Test restore-a mesečno** na staging projekat, sa zapisnikom.
- Incident: kontakt lista i postupak opoziva ključeva (rotacija QR HMAC ključa poništava sve aktivne tokene, što je bezbedno jer žive 60 s).
