/**
 * Local development database - no Docker, no Supabase project needed.
 *   pnpm db:dev          start (first run: init + migrations + seed + dev users)
 *   pnpm db:dev --reset  wipe and start fresh
 * Data lives in <repo>/.tmp/dev-db. Postgres listens on 127.0.0.1:54322 (user/pass postgres/postgres, db "grit").
 * New migrations are applied automatically on every start.
 */
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { listMigrations, shimFile, supabaseDir } from '../src/migrate';

const PORT = 54322;
const DB = 'grit';
const dataDir = path.resolve(supabaseDir, '../.tmp/dev-db');
const url = (db: string) => `postgres://postgres:postgres@127.0.0.1:${PORT}/${db}`;

/** Dev staff accounts (sign in via the admin "DEV prijava"). Clearly not real people. */
const DEV_USERS = [
  { email: 'vlasnik@grit.local', first: 'Dev', last: 'Vlasnik', role: 'owner' },
  { email: 'menadzer@grit.local', first: 'Dev', last: 'Menadžer', role: 'manager' },
  { email: 'recepcija@grit.local', first: 'Dev', last: 'Recepcija', role: 'reception' },
];

if (process.argv.includes('--reset')) {
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  console.warn('dev database wiped');
}

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});
if (fresh) await server.initialise();
await server.start();

if (fresh) {
  const admin = new pg.Client({ connectionString: url('postgres') });
  await admin.connect();
  await admin.query(`create database ${DB}`);
  await admin.end();
}

const client = new pg.Client({ connectionString: url(DB) });
await client.connect();
await client.query('create schema if not exists dev_meta');
await client.query(
  'create table if not exists dev_meta.applied (file text primary key, at timestamptz default now())',
);
const applied = new Set(
  (await client.query<{ file: string }>('select file from dev_meta.applied')).rows.map(
    (r) => r.file,
  ),
);

const files = [shimFile, ...(await listMigrations())];
let count = 0;
for (const file of files) {
  const name = path.basename(file);
  if (applied.has(name)) continue;
  await client.query('begin');
  try {
    await client.query(await readFile(file, 'utf8'));
    await client.query('insert into dev_meta.applied (file) values ($1)', [name]);
    await client.query('commit');
    count += 1;
  } catch (e) {
    await client.query('rollback');
    throw new Error(`migration ${name} failed: ${(e as Error).message}`);
  }
}

if (fresh) {
  await client.query(await readFile(path.join(supabaseDir, 'seed', 'seed.sql'), 'utf8'));
  for (const u of DEV_USERS) {
    const { rows } = await client.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [u.email, JSON.stringify({ first_name: u.first, last_name: u.last })],
    );
    await client.query(
      `insert into public.user_roles (user_id, role_id)
       select $1, id from public.roles where key = $2 and club_id = (select id from public.clubs where is_default)`,
      [rows[0]!.id, u.role],
    );
    await client.query(`insert into public.staff_profiles (user_id, job_title) values ($1, $2)`, [
      rows[0]!.id,
      `[DEV] ${u.role}`,
    ]);
  }
}

// Dev member account for the mobile app (idempotent: created on any start if missing).
const DEV_MEMBER_EMAIL = 'clan@grit.local';
const existing = await client.query(`select 1 from auth.users where email = $1`, [
  DEV_MEMBER_EMAIL,
]);
if (existing.rowCount === 0) {
  await client.query('begin');
  const user = await client.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [DEV_MEMBER_EMAIL, JSON.stringify({ first_name: 'Dev', last_name: 'Član' })],
  );
  const member = await client.query<{ id: string }>(
    `insert into public.members (user_id, first_name, last_name, email, phone)
     values ($1, 'Dev', 'Član', $2, '+381600000099') returning id`,
    [user.rows[0]!.id, DEV_MEMBER_EMAIL],
  );
  // Active monthly gym membership that started 10 days ago, partially paid (shows debt in the app).
  const ms = await client.query<{ id: string }>(
    `insert into public.memberships (member_id, plan_id, state, start_date, end_date, price_amount)
     select $1, p.id, 'active', public.club_today() - 10, public.club_today() - 10 + p.duration_days - 1, p.price_amount
     from public.membership_plans p
     join public.membership_plan_translations t on t.plan_id = p.id and t.locale = 'sr'
     where t.name = 'Teretana - mesečna'
     returning id`,
    [member.rows[0]!.id],
  );
  const owner = await client.query<{ id: string }>(
    `select id from auth.users where email = 'vlasnik@grit.local'`,
  );
  if (ms.rows[0] && owner.rows[0]) {
    await client.query(
      `insert into public.payments (member_id, membership_id, amount, method, recorded_by, paid_at)
       values ($1, $2, 300000, 'cash', $3, now() - interval '10 days')`,
      [member.rows[0]!.id, ms.rows[0].id, owner.rows[0].id],
    );
  }
  await client.query('commit');
}
// F12-3: the dev owner is also the platform owner (approves gyms that register). Idempotent.
await client.query(
  `insert into public.platform_admins (user_id)
   select id from auth.users where email = 'vlasnik@grit.local'
   on conflict do nothing`,
);
await client.end();

console.warn(
  [
    '',
    `GRIT dev database ready on ${url(DB)}`,
    `  migrations applied this run: ${count}${fresh ? ' (fresh database, seed + dev users created)' : ''}`,
    `  dev staff: ${DEV_USERS.map((u) => u.email).join(', ')}`,
    `  dev member (mobile app): ${DEV_MEMBER_EMAIL}`,
    '  Ctrl+C to stop.',
    '',
  ].join('\n'),
);

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
setInterval(() => {}, 1 << 30); // keep the process alive
