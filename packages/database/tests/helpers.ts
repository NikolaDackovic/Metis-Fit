import pg from 'pg';
import { inject } from 'vitest';
import { createTestDatabase } from '../src/testing';

export interface TestDb {
  /** Superuser client (bypasses RLS) for arranging fixtures. */
  admin: pg.Client;
  /** Run `fn` as Supabase role `anon`, or as `authenticated` with the given user id. Always rolled back. */
  as<T>(who: 'anon' | { userId: string }, fn: (c: pg.Client) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openTestDb(): Promise<TestDb> {
  const db = await createTestDatabase(inject('pgAdminUrl'));
  const admin = new pg.Client({ connectionString: db.url });
  await admin.connect();
  const scoped = new pg.Client({ connectionString: db.url });
  await scoped.connect();

  return {
    admin,
    async as(who, fn) {
      await scoped.query('begin');
      try {
        if (who === 'anon') {
          await scoped.query('set local role anon');
        } else {
          await scoped.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: who.userId, role: 'authenticated' }),
          ]);
          await scoped.query('set local role authenticated');
        }
        return await fn(scoped);
      } finally {
        await scoped.query('rollback');
      }
    },
    async close() {
      await admin.end();
      await scoped.end();
      await db.drop();
    },
  };
}

/** Creates an auth user (profile is created by trigger) and optionally a linked member. */
export async function createUser(
  admin: pg.Client,
  opts: { email: string; member?: boolean; role?: string },
): Promise<{ userId: string; memberId: string | null }> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, '{"first_name":"Test","last_name":"User"}') returning id`,
    [opts.email],
  );
  const userId = rows[0]!.id;
  let memberId: string | null = null;
  if (opts.member) {
    const m = await admin.query<{ id: string }>(
      `insert into public.members (user_id, first_name, last_name, email) values ($1, 'Test', 'Member', $2) returning id`,
      [userId, opts.email],
    );
    memberId = m.rows[0]!.id;
  }
  if (opts.role) {
    await admin.query(
      `insert into public.user_roles (user_id, role_id) select $1, id from public.roles where key = $2`,
      [userId, opts.role],
    );
  }
  return { userId, memberId };
}

export async function createPlan(
  admin: pg.Client,
  visitLimit: number | null = null,
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into public.membership_plans (kind, price_amount, duration_days, visit_limit, is_available)
     values ($1, 550000, 30, $2, true) returning id`,
    [visitLimit ? 'visit_pack' : 'unlimited', visitLimit],
  );
  return rows[0]!.id;
}

export async function createMembership(
  admin: pg.Client,
  memberId: string,
  planId: string,
  start: string,
  end: string,
): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into public.memberships (member_id, plan_id, state, start_date, end_date, price_amount)
     values ($1, $2, 'active', $3, $4, 550000) returning id`,
    [memberId, planId, start, end],
  );
  return rows[0]!.id;
}
