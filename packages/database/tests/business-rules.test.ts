import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMembership, createPlan, createUser, openTestDb, type TestDb } from './helpers';

let db: TestDb;
let staffId: string;
let memberId: string;
let planId: string;

beforeAll(async () => {
  db = await openTestDb();
  staffId = (await createUser(db.admin, { email: 'owner@example.com', role: 'owner' })).userId;
  memberId = (await createUser(db.admin, { email: 'm@example.com', member: true })).memberId!;
  planId = await createPlan(db.admin);
});
afterAll(async () => db?.close());

describe('identity', () => {
  it('creates a profile for every new auth user', async () => {
    const { rows } = await db.admin.query('select first_name from public.profiles where id = $1', [
      staffId,
    ]);
    expect(rows[0]).toEqual({ first_name: 'Test' });
  });

  it('resolves permissions through roles', async () => {
    const check = async (user: string, perm: string) =>
      (await db.admin.query('select public.has_permission($1, $2) ok', [user, perm])).rows[0].ok;
    const reception = (await createUser(db.admin, { email: 'r@example.com', role: 'reception' }))
      .userId;
    expect(await check(staffId, 'roles.manage')).toBe(true);
    expect(await check(reception, 'attendance.checkin')).toBe(true);
    expect(await check(reception, 'payments.void')).toBe(false);
  });
});

describe('membership_display_status', () => {
  const today = '2026-11-16';
  const cases: Array<[string, [string, string, string | null, number | null, number], string]> = [
    ['cancelled wins', ['cancelled', '2026-11-01', '2026-12-31', null, 0], 'cancelled'],
    ['pending state', ['pending', '2026-11-01', '2026-12-31', null, 0], 'pending'],
    ['paused state', ['paused', '2026-11-01', '2026-12-31', null, 0], 'paused'],
    ['future start is pending', ['active', '2026-11-17', '2026-12-31', null, 0], 'pending'],
    [
      'valid through end date (inclusive)',
      ['active', '2026-10-01', '2026-11-16', null, 0],
      'expiring_soon',
    ],
    ['expired the day after end', ['active', '2026-10-01', '2026-11-15', null, 0], 'expired'],
    [
      '7 days left is expiring soon',
      ['active', '2026-11-01', '2026-11-23', null, 0],
      'expiring_soon',
    ],
    ['8 days left is active', ['active', '2026-11-01', '2026-11-24', null, 0], 'active'],
    ['no visits left is expired', ['active', '2026-11-01', '2026-12-31', 12, 12], 'expired'],
    [
      '2 visits left is expiring soon',
      ['active', '2026-11-01', '2026-12-31', 12, 10],
      'expiring_soon',
    ],
    ['3 visits left is active', ['active', '2026-11-01', '2026-12-31', 12, 9], 'active'],
  ];
  for (const [name, [state, start, end, limit, used], expected] of cases) {
    it(name, async () => {
      const { rows } = await db.admin.query(
        'select public.membership_display_status($1, $2, $3, $4, $5, $6) s',
        [state, start, end, limit, used, today],
      );
      expect(rows[0].s).toBe(expected);
    });
  }

  it('reads the expiring threshold from settings', async () => {
    await db.admin.query(
      `update public.settings set value = '14' where key = 'membership.expiring_soon_days'`,
    );
    const { rows } = await db.admin.query(
      `select public.membership_display_status('active', '2026-11-01', '2026-11-26', null, 0, '2026-11-16') s`,
    );
    expect(rows[0].s).toBe('expiring_soon');
    await db.admin.query(
      `update public.settings set value = '7' where key = 'membership.expiring_soon_days'`,
    );
  });
});

describe('memberships', () => {
  it('rejects overlapping memberships of the same plan', async () => {
    await createMembership(db.admin, memberId, planId, '2026-01-01', '2026-01-31');
    await expect(
      createMembership(db.admin, memberId, planId, '2026-01-31', '2026-02-28'),
    ).rejects.toThrow(/memberships_no_overlap/);
    await expect(
      createMembership(db.admin, memberId, planId, '2026-02-01', '2026-02-28'),
    ).resolves.toBeTypeOf('string');
  });

  it('allows a new membership over a cancelled one', async () => {
    const id = await createMembership(db.admin, memberId, planId, '2026-03-01', '2026-03-31');
    await db.admin.query(
      `update public.memberships set state = 'cancelled', cancelled_reason = 'test' where id = $1`,
      [id],
    );
    await expect(
      createMembership(db.admin, memberId, planId, '2026-03-01', '2026-03-31'),
    ).resolves.toBeTypeOf('string');
  });
});

describe('payments are immutable', () => {
  let paymentId: string;
  beforeAll(async () => {
    const { rows } = await db.admin.query(
      `insert into public.payments (member_id, amount, method, recorded_by) values ($1, 100000, 'cash', $2) returning id`,
      [memberId, staffId],
    );
    paymentId = rows[0].id;
  });

  it('cannot be deleted', async () => {
    await expect(
      db.admin.query('delete from public.payments where id = $1', [paymentId]),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it('cannot change the amount', async () => {
    await expect(
      db.admin.query('update public.payments set amount = 1 where id = $1', [paymentId]),
    ).rejects.toThrow(/immutable/);
  });

  it('can be voided once, with a reason', async () => {
    await db.admin.query(
      `update public.payments set status = 'voided', void_reason = 'wrong amount', voided_at = now(), voided_by = $2 where id = $1`,
      [paymentId, staffId],
    );
    await expect(
      db.admin.query(`update public.payments set status = 'recorded' where id = $1`, [paymentId]),
    ).rejects.toThrow(/immutable/);
  });

  it('requires refunds to reference the original payment', async () => {
    await expect(
      db.admin.query(
        `insert into public.payments (member_id, amount, method, recorded_by) values ($1, -100000, 'cash', $2)`,
        [memberId, staffId],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('append-only logs', () => {
  it('audit_logs cannot be updated or deleted, even by the owner connection', async () => {
    await db.admin.query(
      `insert into public.audit_logs (action, entity_type) values ('member.create', 'member')`,
    );
    await expect(db.admin.query(`update public.audit_logs set action = 'x.y'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(db.admin.query('delete from public.audit_logs')).rejects.toThrow(/append-only/);
  });

  it('attendance attempts cannot be rewritten', async () => {
    await db.admin.query(
      `insert into public.attendance_attempts (member_id, source, result, reason_code) values ($1, 'manual', 'granted', 'OK')`,
      [memberId],
    );
    await expect(
      db.admin.query(`update public.attendance_attempts set result = 'denied'`),
    ).rejects.toThrow(/append-only/);
  });

  it('override requires a reason', async () => {
    await expect(
      db.admin.query(
        `insert into public.attendance_attempts (member_id, source, result, reason_code) values ($1, 'override', 'granted', 'OK')`,
        [memberId],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('seed data', () => {
  it('seed.sql applies cleanly and shows no provisional marker', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { supabaseDir } = await import('../src/migrate');
    await db.admin.query('begin');
    try {
      await db.admin.query(await readFile(path.join(supabaseDir, 'seed', 'seed.sql'), 'utf8'));
      const { rows } = await db.admin.query(
        `select count(*)::int n, count(*) filter (where description like '%PROVIZORNO%')::int marked
         from public.membership_plan_translations`,
      );
      expect(rows[0].n).toBe(16);
      expect(rows[0].marked).toBe(0);
    } finally {
      await db.admin.query('rollback');
    }
  });
});
