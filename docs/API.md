# GRIT DIGITAL CLUB - API specifikacija

Status: **PREDLOG.** Osnovni URL je `https://api.<domen>/v1`. Format je JSON. OpenAPI 3.1 se generiše iz zod šema na `/v1/docs`, koji je dostupan samo u dev i staging okruženju.

## 1. Konvencije

### Odgovor

```json
{
  "success": true,
  "data": {},
  "message": null,
  "error": null,
  "meta": { "page": 1, "pageSize": 25, "total": 312 }
}
```

```json
{
  "success": false,
  "data": null,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{ "path": "email", "message": "invalid_email" }]
  }
}
```

- `meta` postoji samo kod listi.
- `message` je ključ za prevod (npr. `errors.membership.overlap`), a ne gotov tekst. Klijent ga prevodi.

### Kodovi grešaka

| HTTP | `error.code`                                                                                  |
| ---- | --------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                                                                            |
| 401  | `UNAUTHENTICATED`, `MFA_REQUIRED`                                                             |
| 403  | `FORBIDDEN`                                                                                   |
| 404  | `NOT_FOUND` (i kada resurs postoji, ali pripada drugom članu, da se ne bi otkrilo da postoji) |
| 409  | `CONFLICT` (`MEMBERSHIP_OVERLAP`, `CLASS_FULL`, `ALREADY_BOOKED`…)                            |
| 422  | `BUSINESS_RULE` (npr. `PAUSE_NOT_ALLOWED`)                                                    |
| 429  | `RATE_LIMITED` (+ `Retry-After`)                                                              |
| 500  | `INTERNAL` (bez stack trace-a; `requestId` za podršku)                                        |

### Ostalo

- **Paginacija:** `?page=1&pageSize=25` (max 100). Sortiranje: `?sort=-createdAt`.
- **Idempotentnost:** `POST` za uplate, check-in i rezervacije prihvata `Idempotency-Key` header. Ključ se čuva 24h, a ponovljen zahtev vraća isti odgovor.
- **Jezik:** `Accept-Language: sr|en|ru|ar` bira prevod sadržaja. Ako prevod ne postoji, vraća se `sr`.
- **Datumi:** ISO 8601. `date` je `YYYY-MM-DD`, a `timestamptz` je UTC `Z`.
- **Novac:** `{ "amount": 350000, "currency": "RSD" }` (pare).
- **Autorizacija:** u tabelama ispod, kolona "Pristup" navodi potrebnu dozvolu. `self` znači da je pristup ograničen na sopstvene podatke.

## 2. Javni endpointi (bez prijave, keširani)

| Metod | Putanja                                       | Opis                                                            |
| ----- | --------------------------------------------- | --------------------------------------------------------------- |
| GET   | `/public/club`                                | Osnovni podaci, kontakt, lokacija, društvene mreže              |
| GET   | `/public/opening-hours`                       | Radno vreme + izuzeci za narednih 30 dana                       |
| GET   | `/public/plans`                               | Dostupni paketi (`is_available`)                                |
| GET   | `/public/trainers`                            | Treneri sa `public_profile = true`                              |
| GET   | `/public/map`                                 | Objavljena verzija mape (spratovi, prostorije, pozicije opreme) |
| GET   | `/public/equipment` · `/public/equipment/:id` | Registar opreme (bez serijskih brojeva i cena)                  |
| GET   | `/public/faq`                                 | Česta pitanja                                                   |
| POST  | `/public/contact`                             | Kontakt forma (rate limit 5/h po IP + honeypot polje)           |

Javni endpointi šalju `Cache-Control: public, max-age=300` i imaju CDN ispred. Javni sajt ih koristi pri build-u.

## 3. Član - `/me` (prijava je obavezna; RLS-scoped transakcija)

| Metod    | Putanja                              | Opis                                                                                                      |
| -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| GET      | `/me`                                | Profil + `member` (ako je povezan) + jezik                                                                |
| PATCH    | `/me`                                | Izmena imena, telefona i jezika (status i e-mail se ne menjaju ovde)                                      |
| POST     | `/me/avatar/upload-url`              | Potpisani upload URL (jpeg/png/webp, ≤ 5 MB)                                                              |
| POST     | `/me/link`                           | `{ code }` povezuje nalog sa članskim profilom (rate limit 5/15 min)                                      |
| GET      | `/me/memberships`                    | Sve članarine sa izračunatim `displayStatus`, `daysLeft`, `visitsRemaining`                               |
| GET      | `/me/memberships/current`            | Članarine koje trenutno važe (za Home i karticu)                                                          |
| POST     | `/me/memberships/:id/pause-requests` | Zahtev za pauzu                                                                                           |
| POST     | `/me/memberships/renewal-requests`   | Zahtev za produženje (obaveštava recepciju; nije naplata)                                                 |
| GET      | `/me/payments`                       | Istorija uplata (bez internih napomena)                                                                   |
| GET      | `/me/attendance`                     | Istorija dolazaka (samo `granted`)                                                                        |
| **POST** | **`/me/access-token`**               | Izdaje QR token (rate limit 10/min) → `{ token, expiresAt }`                                              |
| GET      | `/me/consents` · POST `/me/consents` | Pregled i promena pristanaka                                                                              |
| POST     | `/me/maintenance-reports`            | Prijava kvara `{ equipmentId?, roomKey?, description, photoPath? }`                                       |
| POST     | `/me/data-export`                    | Asinhroni izvoz ličnih podataka (email sa linkom)                                                         |
| GET      | `/me/export`                         | Preuzimanje svih ličnih podataka (JSON)                                                                   |
| POST     | `/me/delete-account`                 | Brisanje naloga (`{ confirm: true }`): lični podaci se brišu, knjigovodstveni zapisi ostaju anonimizovani |

**Primer - `POST /me/access-token`**

```json
// 200
{ "success": true, "data": { "token": "g1.3f0c…b9.Q2x5…", "expiresAt": "2026-11-16T18:01:00Z", "refreshInSec": 45 } }
// 422 kada član nema članarinu koja važi - app prikazuje stanje, ne QR
{ "success": false, "error": { "code": "BUSINESS_RULE", "details": [{ "reason": "NO_ACTIVE_MEMBERSHIP" }] } }
```

Ako članarina ne važi, token se **ne izdaje**. Tako se izbegava QR koji "izgleda važeće", a biće odbijen.

## 4. Administracija - `/admin` (staff; MFA aal2 obavezan za owner/manager)

### Članovi

| Metod    | Putanja                                                                  | Pristup                                                       |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| GET      | `/admin/members?q=&status=&planId=&expiringWithinDays=&lastVisitBefore=` | `members.read`                                                |
| POST     | `/admin/members`                                                         | `members.create`                                              |
| GET      | `/admin/members/:id`                                                     | `members.read` - profil, članarine, uplate, dolasci, napomene |
| PATCH    | `/admin/members/:id`                                                     | `members.update`                                              |
| POST     | `/admin/members/:id/deactivate`                                          | `members.deactivate`                                          |
| POST     | `/admin/members/:id/invite`                                              | `members.update` - šalje pozivnicu e-mailom                   |
| POST     | `/admin/members/:id/link-code`                                           | `members.update` - kod za povezivanje (vraća se jednom)       |
| GET/POST | `/admin/members/:id/notes`                                               | `members.notes`                                               |
| GET      | `/admin/members/:id/audit`                                               | `audit.read`                                                  |

### Paketi i članarine

| Metod    | Putanja                                                     | Pristup                                                                                                      |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET/POST | `/admin/plans`                                              | `plans.read` / `plans.manage`                                                                                |
| PATCH    | `/admin/plans/:id`                                          | `plans.manage` (cena se menja samo za buduće prodaje)                                                        |
| POST     | `/admin/members/:id/memberships`                            | `memberships.create` - `{ planId, startDate, payment?: {...} }`, članarina i uplata u **jednoj transakciji** |
| POST     | `/admin/memberships/:id/cancel`                             | `memberships.cancel` (razlog je obavezan)                                                                    |
| POST     | `/admin/memberships/:id/pauses` · PATCH `/admin/pauses/:id` | `memberships.pause`                                                                                          |
| GET      | `/admin/pause-requests?status=requested`                    | `memberships.pause`                                                                                          |

### Uplate

| Metod | Putanja                                       | Pristup                                 |
| ----- | --------------------------------------------- | --------------------------------------- |
| GET   | `/admin/payments?from=&to=&method=&memberId=` | `payments.read`                         |
| POST  | `/admin/payments`                             | `payments.create` (+ `Idempotency-Key`) |
| POST  | `/admin/payments/:id/void`                    | `payments.void`                         |
| POST  | `/admin/payments/:id/refund`                  | `payments.refund`                       |
| GET   | `/admin/payments/export.csv`                  | `payments.export`                       |

### Dolasci / pristup

| Metod    | Putanja                                              | Pristup                                               |
| -------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **POST** | **`/admin/access/validate`** `{ token, terminalId }` | `attendance.checkin` (rate limit 60/min po terminalu) |
| POST     | `/admin/access/manual` `{ memberId, terminalId }`    | `attendance.checkin`                                  |
| POST     | `/admin/access/override` `{ memberId, reason }`      | `attendance.override`                                 |
| GET      | `/admin/attendance?from=&to=&result=&memberId=`      | `attendance.read`                                     |

**Odgovor validacije** (optimizovan za ekran recepcije):

```json
{
  "success": true,
  "data": {
    "result": "denied",
    "reasonCode": "NO_ACTIVE_MEMBERSHIP",
    "member": {
      "id": "…",
      "memberNumber": "G-000123",
      "fullName": "…",
      "photoUrl": "…(potpisan, 60s)"
    },
    "membership": {
      "planName": "…",
      "displayStatus": "expired",
      "endDate": "2026-11-10",
      "visitsRemaining": null
    },
    "attemptId": "…"
  }
}
```

Odbijen ulaz vraća **HTTP 200** sa `result: denied`, jer je to validan poslovni ishod, a ne greška. 4xx se koristi samo za neispravan zahtev ili nedostatak dozvole.

### Mapa i oprema

| Metod     | Putanja                                                                                | Pristup              |
| --------- | -------------------------------------------------------------------------------------- | -------------------- |
| GET       | `/admin/map/draft` · PUT `/admin/map/draft` (ceo draft, optimistic lock po `revision`) | `map.edit`           |
| POST      | `/admin/map/publish`                                                                   | `map.publish`        |
| GET       | `/admin/map/versions`                                                                  | `map.edit`           |
| CRUD      | `/admin/equipment`, `/admin/equipment/:id/media`                                       | `equipment.manage`   |
| GET/PATCH | `/admin/maintenance-requests`                                                          | `maintenance.manage` |
| POST      | `/admin/equipment/:id/service-log`                                                     | `maintenance.manage` |

### Zaposleni, podešavanja, izveštaji

| Metod   | Putanja                                                                           | Pristup                                                                     |
| ------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| CRUD    | `/admin/staff`, `/admin/staff/:id/roles`                                          | `staff.manage` (owner ne može sebi oduzeti ulogu owner ako je jedini owner) |
| GET/PUT | `/admin/roles/:id/permissions`                                                    | `roles.manage` (samo owner)                                                 |
| GET/PUT | `/admin/settings/:key`, `/admin/opening-hours`                                    | `settings.manage`                                                           |
| GET     | `/admin/reports/dashboard?from=&to=`                                              | `reports.read` - svi brojevi iz stvarnih upita; prazno ako nema podataka    |
| GET     | `/admin/reports/attendance-daily`, `/revenue`, `/memberships-expiring` (+ `.csv`) | `reports.read` / `payments.read`                                            |
| GET     | `/admin/audit-logs`                                                               | `audit.read`                                                                |

## 5. Interni / sistemski

| Metod | Putanja                              | Opis                                                                                     |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| GET   | `/health`                            | Liveness                                                                                 |
| GET   | `/ready`                             | Readiness (DB ping)                                                                      |
| POST  | `/internal/webhooks/rebuild-website` | Potpisani webhook ka Cloudflare build hook-u, poziva ga API posle izmene javnog sadržaja |

## 6. Kasnije faze (endpointi se dodaju po modulu)

`/me/bookings`, `/public/classes`, `/admin/classes`, `/me/workouts`, `/me/progress`, `/public/cafe`, `/admin/cafe`, `/me/notifications`, `/admin/campaigns`, `/admin/promo-codes`. Svaki se specificira pre početka svoje faze.
