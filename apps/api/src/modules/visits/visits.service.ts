import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  AdminLockerMapDto,
  LockerMapDto,
  LockerRefDto,
  MyVisitNowDto,
  OccupancyDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

const iso = (d: Date | string) => new Date(d).toISOString();
const rule = (key: string) => new AppError('BUSINESS_RULE', `errors.visit.${key}`);

async function closeStale(tx: Tx) {
  await sql`select public.close_stale_visits()`.execute(tx);
}

async function autoCloseHours(tx: Tx) {
  return sql<{ h: number }>`select public.setting_int('visits.auto_close_hours', 5) as h`
    .execute(tx)
    .then((r) => r.rows[0]!.h);
}

async function lockerRef(
  tx: Tx,
  lockerId: string | null,
  locale: string,
): Promise<LockerRefDto | null> {
  if (!lockerId) return null;
  const r = await sql<{ id: string; number: number; key: string; name: string }>`
    select l.id, l.number, r.key, coalesce(t.name, ts.name, r.key) as name
    from public.lockers l
    join public.changing_rooms r on r.id = l.changing_room_id
    left join public.changing_room_translations t on t.changing_room_id = r.id and t.locale = ${locale}
    left join public.changing_room_translations ts on ts.changing_room_id = r.id and ts.locale = 'sr'
    where l.id = ${lockerId}
  `
    .execute(tx)
    .then((x) => x.rows[0]);
  return r ? { id: r.id, number: r.number, roomKey: r.key, roomName: r.name } : null;
}

async function openVisit(tx: Tx, memberId: string, lock = false) {
  let q = tx
    .selectFrom('visits')
    .select(['id', 'started_at', 'locker_id'])
    .where('member_id', '=', memberId)
    .where('ended_at', 'is', null);
  if (lock) q = q.forUpdate();
  return q.executeTakeFirst();
}

async function rooms(tx: Tx, locale: string) {
  return sql<{ id: string; key: string; name: string }>`
    select r.id, r.key, coalesce(t.name, ts.name, r.key) as name
    from public.changing_rooms r
    left join public.changing_room_translations t on t.changing_room_id = r.id and t.locale = ${locale}
    left join public.changing_room_translations ts on ts.changing_room_id = r.id and ts.locale = 'sr'
    where r.is_active order by r.sort_order
  `
    .execute(tx)
    .then((r) => r.rows);
}

async function lockerRows(tx: Tx) {
  return sql<{
    id: string;
    room_id: string;
    number: number;
    status: 'available' | 'out_of_service';
    note: string | null;
    visit_id: string | null;
    member_id: string | null;
    first_name: string | null;
    last_name: string | null;
    taken_at: Date | null;
  }>`
    select l.id, l.changing_room_id as room_id, l.number, l.status, l.note,
           v.id as visit_id, v.member_id, m.first_name, m.last_name, v.locker_taken_at as taken_at
    from public.lockers l
    left join public.visits v on v.locker_id = l.id and v.ended_at is null
    left join public.members m on m.id = v.member_id
    order by l.number
  `
    .execute(tx)
    .then((r) => r.rows);
}

export function createVisitService(db: Kysely<DB>) {
  return {
    // ── Member ────────────────────────────────────────────────────────────────
    mine: (actor: Actor, locale: string): Promise<MyVisitNowDto | null> =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await closeStale(tx);
        const v = await openVisit(tx, memberId);
        if (!v) return null;
        const hours = await autoCloseHours(tx);
        return {
          id: v.id,
          startedAt: iso(v.started_at),
          autoCloseAt: new Date(new Date(v.started_at).getTime() + hours * 3_600_000).toISOString(),
          locker: await lockerRef(tx, v.locker_id, locale),
        };
      }),

    lockerMap: (actor: Actor, locale: string): Promise<LockerMapDto> =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await closeStale(tx);
        const mine = (await openVisit(tx, memberId))?.locker_id ?? null;
        const all = await lockerRows(tx);
        return (await rooms(tx, locale)).map((r) => ({
          key: r.key,
          name: r.name,
          lockers: all
            .filter((l) => l.room_id === r.id)
            .map((l) => ({
              id: l.id,
              number: l.number,
              state:
                l.id === mine
                  ? ('mine' as const)
                  : l.status === 'out_of_service'
                    ? ('out_of_service' as const)
                    : l.visit_id
                      ? ('taken' as const)
                      : ('free' as const),
            })),
        }));
      }),

    /** The guest picks a free locker (only while inside). Switching releases the previous one. */
    pickLocker: (actor: Actor, lockerId: string, locale: string): Promise<MyVisitNowDto> =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await closeStale(tx);
        const v = await openVisit(tx, memberId, true);
        if (!v) throw rule('not_inside');
        const l = await tx
          .selectFrom('lockers as l')
          .innerJoin('changing_rooms as r', 'r.id', 'l.changing_room_id')
          .select(['l.status', 'r.is_active'])
          .where('l.id', '=', lockerId)
          .executeTakeFirst();
        if (!l || !l.is_active) throw notFound('locker');
        if (l.status !== 'available') throw rule('locker_out_of_service');
        try {
          // Savepoint: a unique violation must not abort the whole transaction.
          await sql`savepoint pick_locker`.execute(tx);
          await tx
            .updateTable('visits')
            .set({ locker_id: lockerId, locker_taken_at: new Date() })
            .where('id', '=', v.id)
            .execute();
          await sql`release savepoint pick_locker`.execute(tx);
        } catch (e) {
          await sql`rollback to savepoint pick_locker`.execute(tx);
          if ((e as { code?: string }).code === '23505')
            throw new AppError('CONFLICT', 'errors.visit.locker_taken');
          throw e;
        }
        const hours = await autoCloseHours(tx);
        return {
          id: v.id,
          startedAt: iso(v.started_at),
          autoCloseAt: new Date(new Date(v.started_at).getTime() + hours * 3_600_000).toISOString(),
          locker: await lockerRef(tx, lockerId, locale),
        };
      }),

    releaseLocker: (actor: Actor) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await tx
          .updateTable('visits')
          .set({ locker_id: null, locker_taken_at: null })
          .where('member_id', '=', memberId)
          .where('ended_at', 'is', null)
          .execute();
        return { ok: true };
      }),

    /** Leaving the club: ends the visit and frees the locker. Idempotent. */
    checkOut: (actor: Actor) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        await tx
          .updateTable('visits')
          .set({ ended_at: new Date(), ended_by: 'member', ended_by_user: actor.userId })
          .where('member_id', '=', memberId)
          .where('ended_at', 'is', null)
          .execute();
        return { ok: true };
      }),

    // ── Staff ─────────────────────────────────────────────────────────────────
    occupancy: (locale: string): Promise<OccupancyDto> =>
      withStaffTx(db, async (tx) => {
        await closeStale(tx);
        const rows = await tx
          .selectFrom('visits as v')
          .innerJoin('members as m', 'm.id', 'v.member_id')
          .select([
            'v.id',
            'v.member_id',
            'm.member_number',
            'm.first_name',
            'm.last_name',
            'v.started_at',
            'v.locker_id',
          ])
          .where('v.ended_at', 'is', null)
          .orderBy('v.started_at', 'desc')
          .execute();
        return {
          inside: rows.length,
          visits: await Promise.all(
            rows.map(async (r) => ({
              id: r.id,
              memberId: r.member_id,
              memberNumber: r.member_number,
              firstName: r.first_name,
              lastName: r.last_name,
              startedAt: iso(r.started_at),
              locker: await lockerRef(tx, r.locker_id, locale),
            })),
          ),
        };
      }),

    staffCheckOut: (actor: Actor, req: Request, visitId: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('visits')
          .set({ ended_at: new Date(), ended_by: 'staff', ended_by_user: actor.userId })
          .where('id', '=', visitId)
          .where('ended_at', 'is', null)
          .returning('member_id')
          .executeTakeFirst();
        if (!r) throw notFound('visit');
        await writeAudit(tx, actor, req, {
          action: 'visit.checkout',
          entityType: 'visit',
          entityId: visitId,
        });
        return { ok: true };
      }),

    adminLockers: (locale: string): Promise<AdminLockerMapDto> =>
      withStaffTx(db, async (tx) => {
        await closeStale(tx);
        const all = await lockerRows(tx);
        return (await rooms(tx, locale)).map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          lockers: all
            .filter((l) => l.room_id === r.id)
            .map((l) => ({
              id: l.id,
              number: l.number,
              status: l.status,
              note: l.note,
              occupant: l.visit_id
                ? {
                    visitId: l.visit_id,
                    memberId: l.member_id!,
                    name: `${l.first_name} ${l.last_name}`,
                    since: iso(l.taken_at ?? new Date()),
                  }
                : null,
            })),
        }));
      }),

    addLockers: (actor: Actor, req: Request, roomKey: string, from: number, to: number) =>
      withStaffTx(db, async (tx) => {
        const room = await tx
          .selectFrom('changing_rooms')
          .select('id')
          .where('key', '=', roomKey)
          .executeTakeFirst();
        if (!room) throw notFound('changing_room');
        const res = await sql<{ n: number }>`
          with ins as (
            insert into public.lockers (changing_room_id, number)
            select ${room.id}, n from generate_series(${from}::int, ${to}::int) as n
            on conflict (changing_room_id, number) do nothing
            returning 1)
          select count(*)::int as n from ins
        `
          .execute(tx)
          .then((r) => r.rows[0]!.n);
        await writeAudit(tx, actor, req, {
          action: 'locker.add',
          entityType: 'changing_room',
          entityId: room.id,
          diff: { after: { from, to, added: res } },
        });
        return { added: res };
      }),

    updateLocker: (
      actor: Actor,
      req: Request,
      id: string,
      b: { status?: 'available' | 'out_of_service'; note?: string | null },
    ) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('lockers')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('locker');
        const set = {
          ...(b.status !== undefined && { status: b.status }),
          ...(b.note !== undefined && { note: b.note }),
        };
        if (Object.keys(set).length)
          await tx.updateTable('lockers').set(set).where('id', '=', id).execute();
        // Out of service: whoever holds it keeps their visit but loses the locker.
        if (b.status === 'out_of_service')
          await tx
            .updateTable('visits')
            .set({ locker_id: null, locker_taken_at: null })
            .where('locker_id', '=', id)
            .where('ended_at', 'is', null)
            .execute();
        await writeAudit(tx, actor, req, {
          action: 'locker.update',
          entityType: 'locker',
          entityId: id,
          diff: { before: { status: before.status, note: before.note }, after: set },
        });
        return { ok: true };
      }),

    staffReleaseLocker: (actor: Actor, req: Request, lockerId: string) =>
      withStaffTx(db, async (tx) => {
        await tx
          .updateTable('visits')
          .set({ locker_id: null, locker_taken_at: null })
          .where('locker_id', '=', lockerId)
          .where('ended_at', 'is', null)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'locker.release',
          entityType: 'locker',
          entityId: lockerId,
        });
        return { ok: true };
      }),
  };
}
