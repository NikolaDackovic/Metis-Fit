import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  BookingDto,
  BookingStatus,
  ClassRulesDto,
  MyBookingsDto,
  RosterDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { notifyWaitlistPromoted } from '../notifications/notify';
import { loadRules, querySessions, toAdminDto, toSessionDto } from './classes.query';

const LIVE: BookingStatus[] = ['confirmed', 'waitlisted', 'attended', 'no_show'];
const TAKES_SPOT: BookingStatus[] = ['confirmed', 'attended', 'no_show'];

const rule = (key: string, details: unknown[] = []) =>
  new AppError('BUSINESS_RULE', `errors.booking.${key}`, details);

/** The member linked to this app account (bookings are always made for oneself). */
export async function memberIdFor(tx: Tx, actor: Actor): Promise<string> {
  const m = await tx
    .selectFrom('members')
    .select(['id', 'deactivated_at'])
    .where('user_id', '=', actor.userId)
    .executeTakeFirst();
  if (!m) throw rule('not_linked');
  if (m.deactivated_at) throw rule('member_deactivated');
  return m.id;
}

/** Locks the session row: every capacity decision for one class is serialized by this lock. */
async function lockClass(tx: Tx, classId: string) {
  const c = await tx
    .selectFrom('classes as c')
    .innerJoin('class_types as ct', 'ct.id', 'c.class_type_id')
    .select(['c.id', 'c.starts_at', 'c.ends_at', 'c.capacity', 'c.status', 'ct.zone_id'])
    .where('c.id', '=', classId)
    .forUpdate('c')
    .executeTakeFirst();
  if (!c) throw notFound('class');
  return { ...c, starts_at: new Date(c.starts_at), ends_at: new Date(c.ends_at) };
}

async function takenSpots(tx: Tx, classId: string) {
  const r = await tx
    .selectFrom('bookings')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('class_id', '=', classId)
    .where('status', 'in', TAKES_SPOT)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** FIFO: fills free spots from the waitlist while the class has not started. */
export async function promoteWaitlist(tx: Tx, classId: string): Promise<string[]> {
  const c = await lockClass(tx, classId);
  if (c.status !== 'scheduled' || c.starts_at <= new Date()) return [];
  const free = c.capacity - (await takenSpots(tx, classId));
  if (free <= 0) return [];
  const next = await tx
    .selectFrom('bookings')
    .select('id')
    .where('class_id', '=', classId)
    .where('status', '=', 'waitlisted')
    .orderBy('created_at')
    .orderBy('id')
    .limit(free)
    .execute();
  if (next.length === 0) return [];
  const ids = next.map((n) => n.id);
  await tx
    .updateTable('bookings')
    .set({ status: 'confirmed', promoted_at: new Date() })
    .where('id', 'in', ids)
    .execute();
  await notifyWaitlistPromoted(tx, ids);
  return ids;
}

/** Strikes = no-shows + late cancellations in the rolling window; at the limit → temporary ban. */
export async function strikeStatus(tx: Tx, memberId: string, rules: ClassRulesDto) {
  const rows = await sql<{ at: Date }>`
    select c.starts_at as at
    from public.bookings b
    join public.classes c on c.id = b.class_id
    where b.member_id = ${memberId}
      and (b.status = 'no_show' or b.late_cancel)
      and c.starts_at > now() - make_interval(days => ${rules.strikeWindowDays})
    order by c.starts_at desc
  `
    .execute(tx)
    .then((r) => r.rows);
  let bannedUntil: Date | null = null;
  if (rows.length >= rules.strikeLimit) {
    const until = new Date(new Date(rows[0]!.at).getTime() + rules.banDays * 86_400_000);
    if (until > new Date()) bannedUntil = until;
  }
  return { strikes: rows.length, bannedUntil };
}

/**
 * The member needs a membership valid on the class day whose plan covers the class zone
 * (a plan without zones is not restricted). A group class does not consume a visit (A15).
 */
async function assertEligible(tx: Tx, memberId: string, zoneId: string, startsAt: Date) {
  const ok = await sql<{ ok: boolean }>`
    select exists (
      select 1
      from public.memberships ms
      join public.membership_plans p on p.id = ms.plan_id
      cross join lateral (select (${startsAt.toISOString()}::timestamptz at time zone 'Europe/Belgrade')::date as d) day
      where ms.member_id = ${memberId}
        and ms.state = 'active'
        and ms.start_date <= day.d
        and (ms.end_date is null or ms.end_date >= day.d)
        and (ms.visit_limit is null or ms.visits_used < ms.visit_limit or p.kind = 'personal_training')
        and (not exists (select 1 from public.membership_plan_zones pz where pz.plan_id = p.id)
             or exists (select 1 from public.membership_plan_zones pz
                        where pz.plan_id = p.id and pz.zone_id = ${zoneId}))
        and not exists (select 1 from public.membership_pauses mp
                        where mp.membership_id = ms.id and mp.status = 'approved'
                          and day.d between mp.starts_on and mp.ends_on)
    ) as ok
  `
    .execute(tx)
    .then((r) => r.rows[0]!.ok);
  if (!ok) throw rule('no_membership');
}

async function waitlistPositions(tx: Tx, classIds: string[]) {
  if (classIds.length === 0) return new Map<string, number>();
  const rows = await sql<{ id: string; pos: number }>`
    select id, row_number() over (partition by class_id order by created_at, id)::int as pos
    from public.bookings
    where status = 'waitlisted' and class_id in (${sql.join(classIds)})
  `
    .execute(tx)
    .then((r) => r.rows);
  return new Map(rows.map((r) => [r.id, r.pos]));
}

async function bookingDtos(
  tx: Tx,
  locale: string,
  where: { memberId?: string; ids?: string[] },
): Promise<BookingDto[]> {
  let q = tx
    .selectFrom('bookings')
    .select([
      'id',
      'class_id',
      'status',
      'promoted_at',
      'late_cancel',
      'created_at',
      'cancelled_at',
    ]);
  if (where.memberId) q = q.where('member_id', '=', where.memberId);
  if (where.ids) q = q.where('id', 'in', where.ids);
  const rows = await q.execute();
  if (rows.length === 0) return [];
  const classIds = [...new Set(rows.map((r) => r.class_id))];
  const [rules, sessions, positions] = await Promise.all([
    loadRules(tx),
    querySessions(tx, locale, { ids: classIds }),
    waitlistPositions(tx, classIds),
  ]);
  const byId = new Map(sessions.map((s) => [s.id, toSessionDto(s, rules)]));
  return rows
    .map((b) => ({
      id: b.id,
      classId: b.class_id,
      status: b.status as BookingStatus,
      waitlistPosition: positions.get(b.id) ?? null,
      promotedAt: b.promoted_at ? new Date(b.promoted_at).toISOString() : null,
      lateCancel: b.late_cancel,
      createdAt: new Date(b.created_at).toISOString(),
      cancelledAt: b.cancelled_at ? new Date(b.cancelled_at).toISOString() : null,
      class: byId.get(b.class_id)!,
    }))
    .sort((a, b) => a.class.startsAt.localeCompare(b.class.startsAt));
}

export function createBookingService(db: Kysely<DB>) {
  /** Shared booking path for the app (rules enforced) and the front desk (window/ban bypassed). */
  async function book(
    tx: Tx,
    memberId: string,
    classId: string,
    opts: { waitlist: boolean; source: 'app' | 'staff'; byUserId: string },
  ) {
    const rules = await loadRules(tx);
    const c = await lockClass(tx, classId);
    const now = new Date();
    if (c.status === 'cancelled') throw rule('class_cancelled');
    const closesAt = opts.source === 'staff' ? c.ends_at : c.starts_at;
    if (closesAt <= now) throw rule('closed');
    if (
      opts.source === 'app' &&
      c.starts_at.getTime() - rules.bookingWindowDays * 86_400_000 > now.getTime()
    )
      throw rule('not_open_yet', [
        {
          opensAt: new Date(
            c.starts_at.getTime() - rules.bookingWindowDays * 86_400_000,
          ).toISOString(),
        },
      ]);

    const existing = await tx
      .selectFrom('bookings')
      .select('id')
      .where('class_id', '=', classId)
      .where('member_id', '=', memberId)
      .where('status', 'in', LIVE)
      .executeTakeFirst();
    if (existing) throw new AppError('CONFLICT', 'errors.booking.already_booked');

    if (opts.source === 'app') {
      const { bannedUntil } = await strikeStatus(tx, memberId, rules);
      if (bannedUntil) throw rule('banned', [{ until: bannedUntil.toISOString() }]);
    }
    await assertEligible(tx, memberId, c.zone_id, c.starts_at);

    const full = (await takenSpots(tx, classId)) >= c.capacity;
    if (full && !opts.waitlist) throw rule('full');
    const created = await tx
      .insertInto('bookings')
      .values({
        class_id: classId,
        member_id: memberId,
        status: full ? 'waitlisted' : 'confirmed',
        source: opts.source,
        created_by: opts.byUserId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return created.id;
  }

  async function cancel(
    tx: Tx,
    bookingId: string,
    opts: { memberId?: string; byUserId: string; staff: boolean },
  ) {
    const b0 = await tx
      .selectFrom('bookings')
      .select(['class_id', 'member_id'])
      .where('id', '=', bookingId)
      .executeTakeFirst();
    if (!b0 || (opts.memberId && b0.member_id !== opts.memberId)) throw notFound('booking');
    const rules = await loadRules(tx);
    const c = await lockClass(tx, b0.class_id); // lock order: class first, then booking
    const b = await tx
      .selectFrom('bookings')
      .select(['status'])
      .where('id', '=', bookingId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (b.status !== 'confirmed' && b.status !== 'waitlisted') throw rule('not_cancellable');
    const now = new Date();
    if (!opts.staff && c.starts_at <= now) throw rule('closed');
    const lateCancel =
      !opts.staff &&
      b.status === 'confirmed' &&
      c.starts_at.getTime() - now.getTime() < rules.cancelCutoffMinutes * 60_000;
    await tx
      .updateTable('bookings')
      .set({
        status: 'cancelled',
        cancelled_at: now,
        cancelled_by: opts.byUserId,
        late_cancel: lateCancel,
      })
      .where('id', '=', bookingId)
      .execute();
    const promoted = b.status === 'confirmed' ? await promoteWaitlist(tx, b0.class_id) : [];
    return { lateCancel, promoted, classId: b0.class_id, memberId: b0.member_id };
  }

  return {
    rules: () => withStaffTx(db, (tx) => loadRules(tx)),

    async mine(actor: Actor, locale: string): Promise<MyBookingsDto> {
      return withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const rules = await loadRules(tx);
        const all = await bookingDtos(tx, locale, { memberId });
        const now = new Date().toISOString();
        const { strikes, bannedUntil } = await strikeStatus(tx, memberId, rules);
        return {
          upcoming: all.filter(
            (b) => b.class.endsAt > now && (b.status === 'confirmed' || b.status === 'waitlisted'),
          ),
          past: all
            .filter((b) => !(b.class.endsAt > now && LIVE.includes(b.status)))
            .reverse()
            .slice(0, 30),
          strikes,
          bannedUntil: bannedUntil?.toISOString() ?? null,
        };
      });
    },

    bookSelf: (actor: Actor, locale: string, body: { classId: string; waitlist: boolean }) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const id = await book(tx, memberId, body.classId, {
          waitlist: body.waitlist,
          source: 'app',
          byUserId: actor.userId,
        });
        return (await bookingDtos(tx, locale, { ids: [id] }))[0]!;
      }),

    cancelSelf: (actor: Actor, locale: string, bookingId: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const r = await cancel(tx, bookingId, { memberId, byUserId: actor.userId, staff: false });
        return {
          lateCancel: r.lateCancel,
          booking: (await bookingDtos(tx, locale, { ids: [bookingId] }))[0]!,
        };
      }),

    staffBook: (actor: Actor, req: Request, classId: string, memberId: string) =>
      withStaffTx(db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select(['id', 'deactivated_at'])
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!member) throw notFound('member');
        if (member.deactivated_at) throw rule('member_deactivated');
        const id = await book(tx, memberId, classId, {
          waitlist: true,
          source: 'staff',
          byUserId: actor.userId,
        });
        await writeAudit(tx, actor, req, {
          action: 'booking.create',
          entityType: 'booking',
          entityId: id,
          diff: { after: { classId, memberId } },
        });
        return { id };
      }),

    staffCancel: (actor: Actor, req: Request, bookingId: string) =>
      withStaffTx(db, async (tx) => {
        const r = await cancel(tx, bookingId, { byUserId: actor.userId, staff: true });
        await writeAudit(tx, actor, req, {
          action: 'booking.cancel',
          entityType: 'booking',
          entityId: bookingId,
          diff: { after: { classId: r.classId, promoted: r.promoted } },
        });
        return { promoted: r.promoted.length };
      }),

    markAttendance: (
      actor: Actor,
      req: Request,
      bookingId: string,
      status: 'attended' | 'no_show' | 'confirmed',
    ) =>
      withStaffTx(db, async (tx) => {
        const b = await tx
          .selectFrom('bookings as b')
          .innerJoin('classes as c', 'c.id', 'b.class_id')
          .select(['b.status', 'c.starts_at', 'c.status as class_status'])
          .where('b.id', '=', bookingId)
          .forUpdate('b')
          .executeTakeFirst();
        if (!b) throw notFound('booking');
        if (!TAKES_SPOT.includes(b.status as BookingStatus)) throw rule('not_on_roster');
        if (b.class_status === 'cancelled') throw rule('class_cancelled');
        // Attendance can be marked from 30 minutes before the start.
        if (new Date(b.starts_at).getTime() - 30 * 60_000 > Date.now())
          throw rule('attendance_too_early');
        await tx
          .updateTable('bookings')
          .set({ status, attendance_marked_by: actor.userId })
          .where('id', '=', bookingId)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'booking.attendance',
          entityType: 'booking',
          entityId: bookingId,
          diff: { before: { status: b.status }, after: { status } },
        });
        return { status };
      }),

    roster: (classId: string, locale: string): Promise<RosterDto> =>
      withStaffTx(db, async (tx) => {
        const rules = await loadRules(tx);
        const [session] = await querySessions(tx, locale, { ids: [classId] });
        if (!session) throw notFound('class');
        const rows = await tx
          .selectFrom('bookings as b')
          .innerJoin('members as m', 'm.id', 'b.member_id')
          .select([
            'b.id',
            'b.member_id',
            'm.member_number',
            'm.first_name',
            'm.last_name',
            'b.status',
            'b.source',
            'b.late_cancel',
            'b.created_at',
          ])
          .where('b.class_id', '=', classId)
          .orderBy('b.created_at')
          .orderBy('b.id')
          .execute();
        const positions = await waitlistPositions(tx, [classId]);
        return {
          class: toAdminDto(session, rules),
          entries: rows.map((r) => ({
            bookingId: r.id,
            memberId: r.member_id,
            memberNumber: r.member_number,
            firstName: r.first_name,
            lastName: r.last_name,
            status: r.status as BookingStatus,
            source: r.source as 'app' | 'staff',
            waitlistPosition: positions.get(r.id) ?? null,
            lateCancel: r.late_cancel,
            createdAt: new Date(r.created_at).toISOString(),
          })),
        };
      }),
  };
}
