# GRIT DIGITAL CLUB - Model podataka

Status: **PREDLOG.** PostgreSQL 15+ (Supabase). Šema `public` sadrži poslovne tabele, a `auth` pripada Supabase-u.

## 0. Konvencije

| Pravilo            | Primena                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| PK                 | `id uuid primary key default gen_random_uuid()`                                                                        |
| Vreme              | `created_at timestamptz not null default now()`, `updated_at` se održava trigger-om `set_updated_at()`                 |
| Novac              | `*_amount integer` (pare) + `currency char(3) default 'RSD'`                                                           |
| Datumi bez vremena | `date` (npr. `start_date`, `end_date`)                                                                                 |
| Enum               | Postgres `enum` za stabilne skupove (statusi). Lookup tabela za skupove koje admin menja (kategorije).                 |
| Soft delete        | samo `members`, `staff_profiles`, `equipment`, `products`, `exercises` (`deactivated_at` / `archived_at`)              |
| JSONB              | **samo** za neprozirne vrednosti bez relacija: geometrija poligona na mapi, `audit_logs.diff`, `notification payload`. |
| Prevodi sadržaja   | `<entitet>_translations (entity_id, locale, …)` sa PK (`entity_id`, `locale`)                                          |
| Imenovanje         | snake_case, množina za tabele                                                                                          |
| RLS                | `enable row level security` na **svakoj** tabeli u `public`                                                            |

---

## 1. ER pregled (MVP domeni)

```
auth.users 1─0..1 profiles 1─0..1 members ──< memberships >── membership_plans
                     │                │            │  │
                     │                │            │  └──< membership_pauses
                     │                │            └──< payments
                     │                ├──< access_tokens
                     │                ├──< attendance_attempts >── attendance (uspešni)
                     │                ├──< member_consents
                     │                └──< member_notes (interne, samo staff)
                     ├──< user_roles >── roles ──< role_permissions >── permissions
                     └─0..1 staff_profiles

map_versions ──< floors ──< rooms ──< equipment_placements >── equipment
                                                              │
equipment_categories ──< equipment ──< equipment_media        ├──< maintenance_requests
                                   ──< equipment_exercises >── exercises

settings (key/value, tipizirano)      audit_logs (append-only)
```

---

## 2. Identitet i pristup

```sql
create table profiles (            -- 1:1 sa auth.users
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 80),
  last_name  text not null check (length(last_name) between 1 and 80),
  phone text,
  locale text not null default 'sr' check (locale in ('sr','en','ru','ar')),
  avatar_path text,                -- storage key, ne URL
  created_at, updated_at
);

create table roles (
  id uuid pk, key text unique not null,   -- owner, manager, reception, trainer, cafe_staff, maintenance, member
  is_system boolean not null default false  -- sistemske uloge se ne brišu
);
create table permissions (key text primary key, description text not null); -- 'members.read', 'payments.create'…
create table role_permissions (role_id uuid references roles on delete cascade,
  permission_key text references permissions on delete cascade, primary key (role_id, permission_key));
create table user_roles (user_id uuid references profiles on delete cascade,
  role_id uuid references roles, granted_by uuid references profiles, granted_at timestamptz default now(),
  primary key (user_id, role_id));

create table staff_profiles (
  user_id uuid primary key references profiles,
  job_title text, bio text, is_trainer boolean not null default false,
  public_profile boolean not null default false,   -- prikaz na sajtu/app
  deactivated_at timestamptz, created_at, updated_at
);
```

Funkcija `has_permission(uid, perm) returns boolean` je `security definer`, `stable` i koristi se u RLS politikama.

## 3. Članovi

```sql
create table members (
  id uuid pk,
  user_id uuid unique references profiles(id) on delete set null,  -- NULL = nema app nalog
  member_number text unique not null,       -- čitljiv broj, npr. G-000123 (sekvenca)
  first_name text not null, last_name text not null,
  email citext, phone text,
  date_of_birth date,
  photo_path text,
  notes_public text,                        -- vidljivo članu (npr. "ormarić 12")
  marketing_opt_in boolean not null default false,
  deactivated_at timestamptz,
  created_by uuid references profiles, created_at, updated_at
);
create unique index on members (lower(email)) where email is not null and deactivated_at is null;
create index on members using gin ((first_name || ' ' || last_name) gin_trgm_ops);  -- brza pretraga na recepciji
create index on members (phone);

create table member_link_codes (            -- kod za povezivanje naloga
  id uuid pk, member_id uuid not null references members on delete cascade,
  code_hash text not null, expires_at timestamptz not null, used_at timestamptz,
  created_by uuid not null references profiles
);

create table member_notes (                 -- INTERNE, nikad vidljive članu
  id uuid pk, member_id uuid not null references members on delete cascade,
  body text not null, author_id uuid not null references profiles, created_at
);

create type consent_type as enum ('terms','privacy','marketing','progress_share_trainer','photo_use');
create table member_consents (
  id uuid pk, member_id uuid not null references members on delete cascade,
  type consent_type not null, version text not null,   -- verzija dokumenta
  granted boolean not null, recorded_at timestamptz not null default now(), source text not null  -- app|reception
);  -- append-only istorija; važeći pristanak = poslednji zapis po (member, type)
```

## 4. Članarine i uplate

```sql
create type plan_kind as enum ('time_based','visit_pack','unlimited','zone_pass','class_pack','personal_training');
create table membership_plans (
  id uuid pk,
  kind plan_kind not null,
  price_amount integer not null check (price_amount >= 0), currency char(3) not null default 'RSD',
  duration_days integer check (duration_days > 0),      -- null za čisto "na dolaske" bez roka
  visit_limit integer check (visit_limit > 0),          -- null = neograničeno
  max_pauses smallint not null default 0, max_pause_days smallint not null default 0,
  is_available boolean not null default false,          -- vidljiv u prodaji / na sajtu
  sort_order integer not null default 0,
  created_at, updated_at,
  check (duration_days is not null or visit_limit is not null)
);
create table membership_plan_translations (plan_id uuid references membership_plans on delete cascade,
  locale text, name text not null, description text, terms text, primary key (plan_id, locale));
create table membership_plan_time_windows (     -- npr. "jutarnji paket" 06-14h radnim danima
  id uuid pk, plan_id uuid not null references membership_plans on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), starts_at time not null, ends_at time not null,
  check (ends_at > starts_at));
create table zones (id uuid pk, key text unique not null);   -- gym, crossfit, boxing, pool…
create table membership_plan_zones (plan_id uuid references membership_plans on delete cascade,
  zone_id uuid references zones, primary key (plan_id, zone_id));

create type membership_state as enum ('pending','active','paused','cancelled');
create table memberships (
  id uuid pk,
  member_id uuid not null references members,
  plan_id uuid not null references membership_plans,
  state membership_state not null default 'pending',
  start_date date not null, end_date date,              -- end_date računat iz plana, + pauze
  visit_limit integer, visits_used integer not null default 0 check (visits_used >= 0),
  price_amount integer not null, currency char(3) not null,   -- SNAPSHOT cene
  cancelled_reason text, sold_by uuid references profiles,
  created_at, updated_at,
  check (end_date is null or end_date >= start_date),
  check (visit_limit is null or visits_used <= visit_limit),
  check (state <> 'cancelled' or cancelled_reason is not null)
);
-- Nema dve ne-otkazane članarine ISTOG plana sa preklapajućim periodom:
alter table memberships add constraint no_overlap exclude using gist (
  member_id with =, plan_id with =, daterange(start_date, coalesce(end_date,'infinity'), '[]') with &&
) where (state <> 'cancelled');   -- zahteva btree_gist
create index on memberships (member_id, end_date desc);
create index on memberships (end_date) where state = 'active';   -- izveštaj "uskoro ističe"

create table membership_pauses (
  id uuid pk, membership_id uuid not null references memberships on delete cascade,
  starts_on date not null, ends_on date not null check (ends_on >= starts_on),
  status text not null check (status in ('requested','approved','rejected','cancelled')),
  reason text, decided_by uuid references profiles, created_at, updated_at);

create type payment_method as enum ('cash','card','bank_transfer','other');
create type payment_status as enum ('recorded','voided');
create table payments (
  id uuid pk,
  member_id uuid not null references members,
  membership_id uuid references memberships,
  amount integer not null check (amount <> 0),       -- negativan = refund
  currency char(3) not null default 'RSD',
  method payment_method not null,
  status payment_status not null default 'recorded',
  paid_at timestamptz not null default now(),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  promo_code_id uuid,                                -- FK dodaje Faza 8
  refund_of uuid references payments,
  note text, void_reason text,
  recorded_by uuid not null references profiles,
  created_at,
  check ((amount < 0) = (refund_of is not null)),
  check (status <> 'voided' or void_reason is not null)
);
create index on payments (paid_at desc);
create index on payments (member_id, paid_at desc);
-- UPDATE dozvoljen samo za prelaz recorded→voided (trigger guard); DELETE zabranjen.
```

## 5. Pristup i dolasci

```sql
create table access_tokens (
  jti uuid primary key,                      -- jedini identifikator u QR-u
  member_id uuid not null references members on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  device_id uuid                             -- opciono: koji uređaj ga je tražio
);
create index on access_tokens (expires_at);  -- čišćenje: pg-boss briše > 24h

create type attempt_result as enum ('granted','denied');
create type attempt_source as enum ('qr','manual','override','backfill');
create table attendance_attempts (           -- SVAKI pokušaj, append-only
  id uuid pk,
  member_id uuid references members,         -- null ako token nije prepoznat
  jti uuid,
  source attempt_source not null,
  result attempt_result not null,
  reason_code text not null,                 -- OK, TOKEN_EXPIRED, TOKEN_REUSED, TOKEN_INVALID, NO_ACTIVE_MEMBERSHIP, OUTSIDE_TIME_WINDOW, NO_VISITS_LEFT, MEMBER_DEACTIVATED
  membership_id uuid references memberships, -- koja je članarina "potrošena"
  consumed_visit boolean not null default false,
  terminal_id text,                          -- npr. 'reception-1'
  override_reason text,
  performed_by uuid references profiles,     -- zaposleni na recepciji
  occurred_at timestamptz not null default now(),
  check (source <> 'override' or override_reason is not null)
);
create index on attendance_attempts (occurred_at desc);
create index on attendance_attempts (member_id, occurred_at desc);
create view attendance as select * from attendance_attempts where result = 'granted';
```

Validacija QR-a je **jedna transakcija**:

```sql
update access_tokens set consumed_at = now()
 where jti = $1 and consumed_at is null and expires_at > now()
returning member_id;
-- 0 redova → odbijeno (razlog se utvrđuje dodatnim select-om: nepostojeći / istekao / iskorišćen)
-- zatim: lock članarine (FOR UPDATE), provera pravila, visits_used++ ako treba, insert attempt, insert audit
```

## 6. Mapa i oprema

```sql
create table map_versions (
  id uuid pk, version integer not null unique,
  status text not null check (status in ('draft','published','archived')),
  published_at timestamptz, published_by uuid references profiles, note text, created_at);
create unique index one_draft on map_versions ((true)) where status = 'draft';
create unique index one_published on map_versions ((true)) where status = 'published';

create table floors (id uuid pk, map_version_id uuid not null references map_versions on delete cascade,
  key text not null, level smallint not null, width_m numeric(6,2), height_m numeric(6,2),
  unique (map_version_id, key));
create table floor_translations (floor_id uuid references floors on delete cascade, locale text, name text not null, primary key (floor_id, locale));

create type room_type as enum ('entrance','cafe','garden','reception','lockers','changing_room','toilet','stairs',
  'gym','crossfit','boxing','pool','studio','corridor','other');
create table rooms (
  id uuid pk, floor_id uuid not null references floors on delete cascade,
  key text not null,                         -- stabilan ključ kroz verzije (za linkove)
  type room_type not null, zone_id uuid references zones,
  shape jsonb not null,                      -- {"type":"polygon","points":[[x,y],…]} u metrima ili jedinicama mreže
  is_hidden boolean not null default false,
  unavailable_until timestamptz, unavailable_note text,
  unique (floor_id, key));
create table room_translations (room_id uuid references rooms on delete cascade, locale text,
  name text not null, description text, primary key (room_id, locale));
create table room_media (id uuid pk, room_key text not null, storage_path text not null, sort_order int, alt text);
  -- vezano za room_key, ne za room_id: fotografije preživljavaju nove verzije mape

create table equipment_categories (id uuid pk, key text unique not null, sort_order int);
create table equipment_category_translations (...);
create type equipment_status as enum ('available','maintenance','out_of_service');
create table equipment (                     -- REGISTAR: nezavisan od verzije mape
  id uuid pk, category_id uuid references equipment_categories,
  manufacturer text, model text, serial_number text, asset_tag text unique,
  purchased_on date, status equipment_status not null default 'available',
  video_url text, archived_at timestamptz, created_at, updated_at);
create table equipment_translations (equipment_id uuid references equipment on delete cascade, locale text,
  name text not null, description text, usage_instructions text, safety_notes text, primary key (equipment_id, locale));
create table equipment_media (id uuid pk, equipment_id uuid not null references equipment on delete cascade,
  storage_path text not null, kind text check (kind in ('photo','manual_pdf')), sort_order int);
create table equipment_placements (
  id uuid pk, room_id uuid not null references rooms on delete cascade,
  equipment_id uuid not null references equipment on delete restrict,   -- sprava se NE briše sa mapom
  x numeric(7,2) not null, y numeric(7,2) not null, rotation_deg numeric(5,1) default 0,
  w numeric(6,2), h numeric(6,2),
  unique (room_id, equipment_id));

create type maintenance_status as enum ('open','triaged','in_progress','resolved','rejected');
create table maintenance_requests (
  id uuid pk, equipment_id uuid references equipment, room_key text,
  reported_by uuid references profiles, source text check (source in ('member','staff')),
  description text not null, photo_path text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status maintenance_status not null default 'open', assigned_to uuid references profiles,
  resolved_at timestamptz, resolution_note text, created_at, updated_at);
create table equipment_service_log (id uuid pk, equipment_id uuid not null references equipment,
  serviced_on date not null, note text, performed_by text, cost_amount integer, created_by uuid references profiles, created_at);
```

**Objava mape:** "Publish" kopira draft verziju u novu `published` verziju (u transakciji), stara prelazi u `archived`. Mobilna app čita samo objavljenu verziju. Istorija verzija je zapravo istorija izmena.

## 7. Podešavanja i audit

```sql
create table settings (key text primary key, value jsonb not null, updated_by uuid references profiles, updated_at);
  -- npr. 'membership.expiring_soon_days' = 7; šema vrednosti se validira zod-om u API-ju
create table opening_hours (id uuid pk, weekday smallint check (weekday between 1 and 7),
  opens_at time, closes_at time, is_closed boolean not null default false);
create table opening_hours_exceptions (date date primary key, opens_at time, closes_at time, is_closed boolean, note text);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles, actor_role text,
  action text not null,                       -- 'membership.create', 'payment.void', 'attendance.override'…
  entity_type text not null, entity_id uuid,
  diff jsonb,                                 -- {before, after} samo relevantnih polja, BEZ tajni
  ip inet, user_agent text, request_id text,
  occurred_at timestamptz not null default now()
);
-- REVOKE UPDATE, DELETE ON audit_logs FROM svih uloga; trigger koji podiže grešku na UPDATE/DELETE
create index on audit_logs (entity_type, entity_id, occurred_at desc);
```

## 8. Kasnije faze (skica, detaljan dizajn pre implementacije faze)

| Domen        | Tabele                                                                                                                                                                  | Ključne napomene                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Notifikacije | `devices`, `notification_preferences`, `notifications`, `notification_deliveries`                                                                                       | `dedupe_key unique` na `notifications`; `devices.expo_push_token unique`              |
| Treneri      | `trainer_availability`, `trainer_clients`, `pt_requests`                                                                                                                | `trainer_clients.status` + pristanak određuju vidljivost napretka                     |
| Grupni       | `class_types`(+translations), `classes`, `class_instructors`, `bookings`, `booking_waitlist`                                                                            | `unique (class_id, member_id) where status='confirmed'`; `classes.capacity check > 0` |
| Trening      | `exercises`(+translations), `muscle_groups`, `exercise_muscle_groups`, `equipment_exercises`, `workout_plans`, `workout_plan_items`, `workout_sessions`, `workout_sets` | `workout_sets.client_id unique` za idempotentan offline sync                          |
| Napredak     | `member_goals`, `body_measurements`, `personal_records`, `progress_photos`                                                                                              | privatni bucket; RLS samo vlasnik + trener sa pristankom                              |
| Kafić        | `product_categories`, `products`(+translations), `product_variants`, `product_allergens`                                                                                | 14 EU alergena kao lookup tabela; porudžbine kasnije                                  |
| Marketing    | `promotions`, `promo_codes`, `promotion_redemptions`, `loyalty_accounts`, `loyalty_transactions`, `rewards`, `announcements`, `campaigns`                               | `loyalty_transactions` je ledger (append-only); saldo = suma                          |

Iz master prompta su izostavljeni: `payment_methods` (enum je dovoljan), `invoices` (fiskalni sistem je spoljni), `devices` je pomeren u notifikacije, a `equipment_locations` je zamenjen sa `equipment_placements`.

## 9. RLS sažetak (MVP)

| Tabela                                                          | anon                      | član (authenticated)                               | staff                                           |
| --------------------------------------------------------------- | ------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| profiles                                                        | -                         | select/update **samo svoj** red (bez kolona uloga) | preko API-ja (privilegovano) + `has_permission` |
| members                                                         | -                         | select svoj (`user_id = auth.uid()`)               | API                                             |
| memberships, payments, attendance_attempts                      | -                         | select svoje                                       | API                                             |
| access_tokens                                                   | -                         | - (izdaje samo API)                                | API                                             |
| member_notes, audit_logs                                        | -                         | -                                                  | API                                             |
| membership_plans (+translations)                                | select gde `is_available` | isto                                               | API                                             |
| map_versions/floors/rooms (published), equipment, opening_hours | select objavljeno/aktivno | isto                                               | API                                             |
| maintenance_requests                                            | -                         | insert (sopstvena prijava), select svoje           | API                                             |

Sve politike se testiraju **pgTAP** testovima u `supabase/tests/` (SECURITY.md §3).
