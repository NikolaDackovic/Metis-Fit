import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMembership, createPlan, createUser, openTestDb, type TestDb } from './helpers';

/** Tables members may read (own rows only) or anyone may read (public content). Everything else: no grants. */
const CLIENT_READABLE = new Set([
  'clubs', // F12: public directory of active gyms (select only)
  'profiles',
  'members',
  'memberships',
  'membership_pauses',
  'payments',
  'attendance_attempts',
  'member_consents',
  'membership_plans',
  'membership_plan_translations',
  'membership_plan_zones',
  'zones',
  'opening_hours',
  'opening_hours_exceptions',
  'settings',
  'membership_overview',
  'map_versions',
  'floors',
  'floor_translations',
  'rooms',
  'room_translations',
  'equipment_categories',
  'equipment_category_translations',
  'equipment',
  'equipment_translations',
  'equipment_placements',
  // F6: public schedule + trainers, own bookings / PT requests / PT sessions (column-scoped)
  'trainers',
  'trainer_translations',
  'class_types',
  'class_type_translations',
  'classes',
  'bookings',
  'pt_requests',
  'pt_sessions',
  // F7: public exercise library, own workouts / measurements / goals
  'muscle_groups',
  'muscle_group_translations',
  'exercises',
  'exercise_translations',
  'exercise_muscle_groups',
  'equipment_exercises',
  'workout_sessions',
  'workout_sets',
  'body_measurements',
  'member_goals',
  // F8a: own visits; locker map without occupant names
  'visits',
  'changing_rooms',
  'changing_room_translations',
  'lockers',
  // F7b: own workout plans and nutrition plans
  'workout_plans',
  'workout_plan_days',
  'workout_plan_items',
  'nutrition_plans',
  'food_log_entries',
  'promo_redemptions',
  'club_photos',
  'activities',
  'daily_checkins',
]);

let db: TestDb;
let a: { userId: string; memberId: string };
let b: { userId: string; memberId: string };

beforeAll(async () => {
  db = await openTestDb();
  a = (await createUser(db.admin, { email: 'a@example.com', member: true })) as typeof a;
  b = (await createUser(db.admin, { email: 'b@example.com', member: true })) as typeof b;
  const plan = await createPlan(db.admin);
  const staff = await createUser(db.admin, { email: 'staff@example.com', role: 'reception' });
  for (const m of [a, b]) {
    const ms = await createMembership(db.admin, m.memberId, plan, '2026-01-01', '2026-12-31');
    await db.admin.query(
      `insert into public.payments (member_id, membership_id, amount, method, recorded_by, note)
       values ($1, $2, 550000, 'cash', $3, 'internal note')`,
      [m.memberId, ms, staff.userId],
    );
    await db.admin.query(
      `insert into public.attendance_attempts (member_id, source, result, reason_code, terminal_id)
       values ($1, 'qr', 'granted', 'OK', 'reception-1'), ($1, 'qr', 'denied', 'TOKEN_EXPIRED', 'reception-1')`,
      [m.memberId],
    );
    await db.admin.query(
      `insert into public.member_notes (member_id, body, author_id) values ($1, 'secret staff note', $2)`,
      [m.memberId, staff.userId],
    );
  }
});

afterAll(async () => db?.close());

describe('catalog guarantees', () => {
  it('has RLS enabled on every public table', async () => {
    const { rows } = await db.admin.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('grants client roles access only to whitelisted tables', async () => {
    const { rows } = await db.admin.query<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
       union
       select distinct table_name from information_schema.column_privileges
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`,
    );
    const unexpected = rows.map((r) => r.table_name).filter((t) => !CLIENT_READABLE.has(t));
    expect(unexpected).toEqual([]);
  });

  it('never grants write privileges on business tables to clients', async () => {
    const { rows } = await db.admin.query<{ t: string; p: string }>(
      `select table_name t, privilege_type p from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    // Only consent INSERT is allowed at table level (profile UPDATE is column-scoped).
    expect(rows).toEqual([{ t: 'member_consents', p: 'INSERT' }]);
  });
});

describe('anonymous access', () => {
  it('cannot read private tables', async () => {
    for (const table of [
      'members',
      'memberships',
      'payments',
      'attendance_attempts',
      'audit_logs',
      'profiles',
    ]) {
      await expect(db.as('anon', (c) => c.query(`select * from public.${table}`))).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('reads available plans and only club.* settings', async () => {
    const plans = await db.as('anon', (c) => c.query('select id from public.membership_plans'));
    expect(plans.rowCount).toBe(1);
    const settings = await db.as('anon', (c) =>
      c.query<{ key: string }>('select key from public.settings'),
    );
    expect(settings.rows.length).toBeGreaterThan(0);
    expect(settings.rows.every((r) => r.key.startsWith('club.'))).toBe(true);
  });
});

describe('member isolation (A must never see B)', () => {
  const ownOnly = [
    ['members', 'id'],
    ['memberships', 'member_id'],
    ['payments', 'member_id'],
    ['attendance_attempts', 'member_id'],
    ['membership_overview', 'member_id'],
  ] as const;

  for (const [table, col] of ownOnly) {
    it(`${table}: sees only own rows`, async () => {
      const { rows } = await db.as({ userId: a.userId }, (c) =>
        c.query<{ owner: string }>(`select ${col} as owner from public.${table}`),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.owner === a.memberId)).toBe(true);
    });
  }

  it('sees only successful check-ins', async () => {
    const { rows } = await db.as({ userId: a.userId }, (c) =>
      c.query<{ result: string }>('select result from public.attendance_attempts'),
    );
    expect(rows.map((r) => r.result)).toEqual(['granted']);
  });

  it('cannot read internal columns (payment note, staff on attendance)', async () => {
    await expect(
      db.as({ userId: a.userId }, (c) => c.query('select note from public.payments')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query('select performed_by from public.attendance_attempts'),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot read staff-only tables', async () => {
    for (const table of [
      'member_notes',
      'audit_logs',
      'access_tokens',
      'user_roles',
      'member_link_codes',
    ]) {
      await expect(
        db.as({ userId: a.userId }, (c) => c.query(`select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot change membership status, dates or visits', async () => {
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query(`update public.memberships set end_date = '2030-01-01'`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('can update own profile name, but not another profile', async () => {
    const own = await db.as({ userId: a.userId }, (c) =>
      c.query(`update public.profiles set first_name = 'Ana' where id = $1`, [a.userId]),
    );
    expect(own.rowCount).toBe(1);
    const other = await db.as({ userId: a.userId }, (c) =>
      c.query(`update public.profiles set first_name = 'Hack' where id = $1`, [b.userId]),
    );
    expect(other.rowCount).toBe(0);
  });

  it('can record own consent but not for another member', async () => {
    const ok = await db.as({ userId: a.userId }, (c) =>
      c.query(
        `insert into public.member_consents (member_id, type, version, granted, source) values ($1, 'marketing', 'v1', true, 'app')`,
        [a.memberId],
      ),
    );
    expect(ok.rowCount).toBe(1);
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query(
          `insert into public.member_consents (member_id, type, version, granted, source) values ($1, 'marketing', 'v1', true, 'app')`,
          [b.memberId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot escalate privileges by granting itself a role', async () => {
    await expect(
      db.as({ userId: a.userId }, (c) =>
        c.query(
          `insert into public.user_roles (user_id, role_id) select $1, id from public.roles where key = 'owner'`,
          [a.userId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
