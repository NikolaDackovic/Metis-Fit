import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  AbsenceBody,
  AbsenceDto,
  AbsenceKind,
  ClockStatusDto,
  ClosureBody,
  ClosureDto,
  PayrollDto,
  ShiftPeopleDto,
  ShiftRuleBody,
  ShiftRuleDto,
  ShiftTypeBody,
  ShiftTypeDto,
  ShiftWeekDto,
  TimeEntryBody,
  TimeEntryDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

const TZ = 'Europe/Belgrade';

// ── Plain date helpers (YYYY-MM-DD, no time zone surprises) ─────────────────
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
/** ISO weekday: Monday 1 ... Sunday 7. */
const isoWeekday = (s: string) => ((toDate(s).getUTCDay() + 6) % 7) + 1;
const mondayOf = (s: string) => addDays(s, 1 - isoWeekday(s));

const hhmm = (t: string) => t.slice(0, 5);
const shiftType = (r: {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}): ShiftTypeDto => ({
  id: r.id,
  name: r.name,
  startsAt: hhmm(r.starts_at),
  endsAt: hhmm(r.ends_at),
  color: r.color,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

async function clubToday(tx: Tx): Promise<string> {
  const { rows } = await sql<{ d: string }>`select public.club_today()::text as d`.execute(tx);
  return rows[0]!.d;
}

async function names(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await tx
    .selectFrom('profiles')
    .select(['id', 'first_name', 'last_name'])
    .where('id', 'in', [...new Set(ids)])
    .execute();
  return new Map(rows.map((r) => [r.id, `${r.first_name} ${r.last_name}`.trim()]));
}

/**
 * Builds the week table from the rules: a rule puts its person on its shift on each listed
 * weekday inside its validity. Absences and closed days remove the person from that day.
 */
async function buildWeek(tx: Tx, start: string | undefined, onlyUser?: string) {
  const monday = mondayOf(start ?? (await clubToday(tx)));
  const sunday = addDays(monday, 6);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const [types, rules, absences, closures] = await Promise.all([
    tx.selectFrom('shift_types').selectAll().orderBy('sort_order').orderBy('starts_at').execute(),
    tx
      .selectFrom('staff_shift_rules')
      .selectAll()
      .where('valid_from', '<=', sunday)
      .where((eb) => eb.or([eb('valid_until', 'is', null), eb('valid_until', '>=', monday)]))
      .$if(!!onlyUser, (q) => q.where('user_id', '=', onlyUser!))
      .execute(),
    tx
      .selectFrom('staff_absences')
      .selectAll()
      .where('starts_on', '<=', sunday)
      .where('ends_on', '>=', monday)
      .$if(!!onlyUser, (q) => q.where('user_id', '=', onlyUser!))
      .execute(),
    tx
      .selectFrom('club_closures')
      .selectAll()
      .where('day', '>=', monday)
      .where('day', '<=', sunday)
      .execute(),
  ]);
  const who = await names(tx, [...rules.map((r) => r.user_id), ...absences.map((a) => a.user_id)]);
  const closureOn = new Map(closures.map((c) => [String(c.day), c]));
  const absentOn = (userId: string, d: string) =>
    absences.find((a) => a.user_id === userId && a.starts_on <= d && a.ends_on >= d);

  const assignments: ShiftWeekDto['assignments'] = [];
  const seen = new Set<string>();
  for (const d of dates) {
    if (closureOn.get(d)?.is_closed) continue;
    const wd = isoWeekday(d);
    for (const r of rules) {
      if (r.valid_from > d || (r.valid_until && r.valid_until < d)) continue;
      if (!r.weekdays.map(Number).includes(wd) || absentOn(r.user_id, d)) continue;
      const k = `${d}|${r.shift_type_id}|${r.user_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      assignments.push({
        date: d,
        shiftTypeId: r.shift_type_id,
        userId: r.user_id,
        name: who.get(r.user_id) ?? '-',
      });
    }
  }
  const absent: ShiftWeekDto['absences'] = [];
  for (const d of dates)
    for (const a of absences)
      if (a.starts_on <= d && a.ends_on >= d)
        absent.push({
          date: d,
          userId: a.user_id,
          name: who.get(a.user_id) ?? '-',
          kind: a.kind as AbsenceKind,
        });

  const week: ShiftWeekDto = {
    monday,
    days: dates.map((d) => {
      const c = closureOn.get(d);
      return {
        date: d,
        weekday: isoWeekday(d),
        closure: c ? { name: c.name, isClosed: c.is_closed } : null,
      };
    }),
    shiftTypes: types.map(shiftType),
    assignments,
    absences: absent,
  };
  return week;
}

async function monthEntries(tx: Tx, month: string, userId?: string) {
  return tx
    .selectFrom('staff_time_entries')
    .selectAll()
    .where(sql<boolean>`to_char(clock_in at time zone ${TZ}, 'YYYY-MM') = ${month}`)
    .$if(!!userId, (q) => q.where('user_id', '=', userId!))
    .orderBy('clock_in')
    .execute();
}
const minutesOf = (e: { clock_in: Date; clock_out: Date | null }) =>
  e.clock_out
    ? Math.round((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000)
    : null;
const dayOf = (d: Date) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });

function entryDto(e: {
  id: string;
  user_id: string;
  clock_in: Date;
  clock_out: Date | null;
  source: string;
  note: string | null;
}): TimeEntryDto {
  return {
    id: e.id,
    userId: e.user_id,
    clockIn: new Date(e.clock_in).toISOString(),
    clockOut: e.clock_out ? new Date(e.clock_out).toISOString() : null,
    minutes: minutesOf(e),
    source: e.source as 'self' | 'admin',
    note: e.note,
  };
}

async function audit(
  tx: Tx,
  actor: Actor,
  req: Request,
  action: string,
  entityType: string,
  entityId: string | null,
  after: Record<string, unknown> | null = null,
) {
  await writeAudit(tx, actor, req, {
    action,
    entityType,
    entityId,
    diff: after ? { after } : null,
  });
}

export function createShiftsService(db: Kysely<DB>) {
  return {
    // ── Shift types ───────────────────────────────────────────────────────────
    types: () =>
      withStaffTx(db, async (tx) =>
        (
          await tx
            .selectFrom('shift_types')
            .selectAll()
            .orderBy('sort_order')
            .orderBy('starts_at')
            .execute()
        ).map(shiftType),
      ),

    saveType: (actor: Actor, req: Request, b: ShiftTypeBody, id?: string) =>
      withStaffTx(db, async (tx) => {
        const values = {
          name: b.name,
          starts_at: b.startsAt,
          ends_at: b.endsAt,
          color: b.color.toUpperCase(),
          sort_order: b.sortOrder,
          is_active: b.isActive,
        };
        const row = id
          ? await tx
              .updateTable('shift_types')
              .set(values)
              .where('id', '=', id)
              .returningAll()
              .executeTakeFirst()
          : await tx.insertInto('shift_types').values(values).returningAll().executeTakeFirst();
        if (!row) throw notFound('shift');
        await audit(
          tx,
          actor,
          req,
          id ? 'shift_type.update' : 'shift_type.create',
          'shift_type',
          row.id,
          {
            name: b.name,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
          },
        );
        return shiftType(row);
      }),

    deleteType: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx.deleteFrom('shift_types').where('id', '=', id).executeTakeFirst();
        if (!Number(r.numDeletedRows)) throw notFound('shift');
        await audit(tx, actor, req, 'shift_type.delete', 'shift_type', id);
      }),

    // ── People who can be scheduled (active staff) ───────────────────────────
    people: () =>
      withStaffTx(db, async (tx): Promise<ShiftPeopleDto> => {
        const rows = await sql<{ id: string; name: string; roles: string[] }>`
          select p.id, trim(p.first_name || ' ' || p.last_name) as name,
                 array_agg(distinct r.key order by r.key) as roles
          from public.profiles p
          join public.user_roles ur on ur.user_id = p.id
          join public.roles r on r.id = ur.role_id and r.key <> 'member'
          left join public.staff_profiles sp on sp.user_id = p.id
          where sp.deactivated_at is null
          group by p.id
          order by name`
          .execute(tx)
          .then((r) => r.rows);
        return rows.map((r) => ({ userId: r.id, name: r.name, roles: r.roles }));
      }),

    // ── Rules ("who works what, when") ───────────────────────────────────────
    rules: () =>
      withStaffTx(db, async (tx): Promise<ShiftRuleDto[]> => {
        const rows = await tx
          .selectFrom('staff_shift_rules')
          .selectAll()
          .orderBy('valid_from', 'desc')
          .execute();
        const who = await names(
          tx,
          rows.map((r) => r.user_id),
        );
        return rows
          .map((r) => ({
            id: r.id,
            userId: r.user_id,
            userName: who.get(r.user_id) ?? '-',
            shiftTypeId: r.shift_type_id,
            weekdays: r.weekdays.map(Number).sort(),
            validFrom: String(r.valid_from),
            validUntil: r.valid_until ? String(r.valid_until) : null,
            note: r.note,
          }))
          .sort((a, b) => a.userName.localeCompare(b.userName));
      }),

    addRules: (actor: Actor, req: Request, b: ShiftRuleBody) =>
      withStaffTx(db, async (tx) => {
        const days = b.lines.flatMap((l) => l.weekdays);
        if (new Set(days).size !== days.length)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'lines', message: 'validation.shift_day_twice' },
          ]);
        const staff = await tx
          .selectFrom('user_roles as ur')
          .innerJoin('roles as r', 'r.id', 'ur.role_id')
          .select('ur.user_id')
          .where('ur.user_id', '=', b.userId)
          .where('r.key', '<>', 'member')
          .executeTakeFirst();
        if (!staff) throw notFound('staff');
        const types = await tx
          .selectFrom('shift_types')
          .select('id')
          .where(
            'id',
            'in',
            b.lines.map((l) => l.shiftTypeId),
          )
          .execute();
        if (types.length !== new Set(b.lines.map((l) => l.shiftTypeId)).size)
          throw notFound('shift');
        const rows = await tx
          .insertInto('staff_shift_rules')
          .values(
            b.lines.map((l) => ({
              user_id: b.userId,
              shift_type_id: l.shiftTypeId,
              weekdays: [...new Set(l.weekdays)].sort(),
              valid_from: b.validFrom,
              valid_until: b.validUntil,
              note: b.note ?? null,
              created_by: actor.userId,
            })),
          )
          .returning('id')
          .execute();
        await audit(tx, actor, req, 'shift_rule.create', 'staff', b.userId, {
          lines: b.lines,
          validFrom: b.validFrom,
          validUntil: b.validUntil,
        });
        return { created: rows.length };
      }),

    deleteRule: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .deleteFrom('staff_shift_rules')
          .where('id', '=', id)
          .returning('user_id')
          .executeTakeFirst();
        if (!row) throw notFound('shift');
        await audit(tx, actor, req, 'shift_rule.delete', 'staff', row.user_id, { ruleId: id });
      }),

    // ── Absences ──────────────────────────────────────────────────────────────
    absences: (from?: string) =>
      withStaffTx(db, async (tx): Promise<AbsenceDto[]> => {
        const since = from ?? addDays(await clubToday(tx), -60);
        const rows = await tx
          .selectFrom('staff_absences')
          .selectAll()
          .where('ends_on', '>=', since)
          .orderBy('starts_on')
          .execute();
        const who = await names(
          tx,
          rows.map((r) => r.user_id),
        );
        return rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          userName: who.get(r.user_id) ?? '-',
          kind: r.kind as AbsenceKind,
          startsOn: String(r.starts_on),
          endsOn: String(r.ends_on),
          note: r.note,
        }));
      }),

    addAbsence: (actor: Actor, req: Request, b: AbsenceBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('staff_absences')
          .values({
            user_id: b.userId,
            kind: b.kind,
            starts_on: b.startsOn,
            ends_on: b.endsOn,
            note: b.note ?? null,
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await audit(tx, actor, req, 'absence.create', 'staff', b.userId, {
          kind: b.kind,
          startsOn: b.startsOn,
          endsOn: b.endsOn,
        });
        return { id: row.id };
      }),

    deleteAbsence: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .deleteFrom('staff_absences')
          .where('id', '=', id)
          .returning('user_id')
          .executeTakeFirst();
        if (!row) throw notFound('absence');
        await audit(tx, actor, req, 'absence.delete', 'staff', row.user_id, { absenceId: id });
      }),

    // ── Non-working days ──────────────────────────────────────────────────────
    closures: () =>
      withStaffTx(db, async (tx): Promise<ClosureDto[]> => {
        const since = addDays(await clubToday(tx), -30);
        const rows = await tx
          .selectFrom('club_closures')
          .selectAll()
          .where('day', '>=', since)
          .orderBy('day')
          .execute();
        return rows.map((r) => ({
          id: r.id,
          day: String(r.day),
          name: r.name,
          isClosed: r.is_closed,
        }));
      }),

    addClosure: (actor: Actor, req: Request, b: ClosureBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('club_closures')
          .values({ day: b.day, name: b.name, is_closed: b.isClosed, created_by: actor.userId })
          .onConflict((oc) =>
            oc.columns(['club_id', 'day']).doUpdateSet({ name: b.name, is_closed: b.isClosed }),
          )
          .returning('id')
          .executeTakeFirstOrThrow();
        await audit(tx, actor, req, 'closure.save', 'club_closure', row.id, { ...b });
        return { id: row.id };
      }),

    deleteClosure: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx.deleteFrom('club_closures').where('id', '=', id).executeTakeFirst();
        if (!Number(r.numDeletedRows)) throw notFound('closure');
        await audit(tx, actor, req, 'closure.delete', 'club_closure', id);
      }),

    // ── Week tables ───────────────────────────────────────────────────────────
    week: (start?: string) => withStaffTx(db, (tx) => buildWeek(tx, start)),
    myWeek: (userId: string, start?: string) =>
      withStaffTx(db, (tx) => buildWeek(tx, start, userId)),

    // ── Time clock (self) ─────────────────────────────────────────────────────
    clockStatus: (userId: string) =>
      withStaffTx(db, async (tx): Promise<ClockStatusDto> => {
        const open = await tx
          .selectFrom('staff_time_entries')
          .select(['id', 'clock_in'])
          .where('user_id', '=', userId)
          .where('clock_out', 'is', null)
          .executeTakeFirst();
        const today = await clubToday(tx);
        const entries = await monthEntries(tx, today.slice(0, 7), userId);
        return {
          open: open ? { id: open.id, clockIn: new Date(open.clock_in).toISOString() } : null,
          monthMinutes: entries.reduce((s, e) => s + (minutesOf(e) ?? 0), 0),
          monthDays: new Set(entries.filter((e) => e.clock_out).map((e) => dayOf(e.clock_in))).size,
        };
      }),

    clockIn: (actor: Actor, req: Request) =>
      withStaffTx(db, async (tx) => {
        const open = await tx
          .selectFrom('staff_time_entries')
          .select('id')
          .where('user_id', '=', actor.userId)
          .where('clock_out', 'is', null)
          .executeTakeFirst();
        if (open) throw new AppError('CONFLICT', 'errors.shifts.already_in');
        const row = await tx
          .insertInto('staff_time_entries')
          .values({ user_id: actor.userId, clock_in: new Date(), source: 'self' })
          .returning('id')
          .executeTakeFirstOrThrow();
        await audit(tx, actor, req, 'timeclock.in', 'staff_time_entry', row.id);
      }),

    clockOut: (actor: Actor, req: Request) =>
      withStaffTx(db, async (tx) => {
        const open = await tx
          .selectFrom('staff_time_entries')
          .select(['id', 'clock_in'])
          .where('user_id', '=', actor.userId)
          .where('clock_out', 'is', null)
          .forUpdate()
          .executeTakeFirst();
        if (!open) throw new AppError('CONFLICT', 'errors.shifts.not_in');
        // Forgot to clock out for over 16 h: close at the 16 h mark, the manager corrects it.
        const max = new Date(new Date(open.clock_in).getTime() + 16 * 3600_000);
        const now = new Date();
        const out = now > max ? max : now;
        await tx
          .updateTable('staff_time_entries')
          .set({
            clock_out: out,
            note: now > max ? 'auto: clock-out after 16 h' : null,
          })
          .where('id', '=', open.id)
          .execute();
        await audit(tx, actor, req, 'timeclock.out', 'staff_time_entry', open.id);
      }),

    // ── Payroll (worked hours x hourly rate) ─────────────────────────────────
    payroll: (month: string) =>
      withStaffTx(db, async (tx): Promise<PayrollDto> => {
        const [entries, rates] = await Promise.all([
          monthEntries(tx, month),
          tx.selectFrom('staff_pay_rates').selectAll().execute(),
        ]);
        const people = await sql<{ id: string; name: string }>`
          select distinct p.id, trim(p.first_name || ' ' || p.last_name) as name
          from public.profiles p
          join public.user_roles ur on ur.user_id = p.id
          join public.roles r on r.id = ur.role_id and r.key <> 'member'
          left join public.staff_profiles sp on sp.user_id = p.id
          where sp.deactivated_at is null
             or exists (select 1 from public.staff_time_entries e where e.user_id = p.id
                        and to_char(e.clock_in at time zone ${TZ}, 'YYYY-MM') = ${month})
          order by name`
          .execute(tx)
          .then((r) => r.rows);
        const rateOf = new Map(rates.map((r) => [r.user_id, r]));
        const rows = people.map((p) => {
          const mine = entries.filter((e) => e.user_id === p.id);
          const minutes = mine.reduce((s, e) => s + (minutesOf(e) ?? 0), 0);
          const rate = rateOf.get(p.id);
          const rateMinor = rate ? Number(rate.hourly_rate_minor) : null;
          return {
            userId: p.id,
            name: p.name,
            days: new Set(mine.filter((e) => e.clock_out).map((e) => dayOf(e.clock_in))).size,
            minutes,
            openEntry: mine.some((e) => !e.clock_out),
            hourlyRateMinor: rateMinor,
            currency: rate?.currency ?? 'RSD',
            payoutMinor: rateMinor === null ? null : Math.round((minutes / 60) * rateMinor),
          };
        });
        return {
          month,
          rows,
          totalMinor: rows.reduce((s, r) => s + (r.payoutMinor ?? 0), 0),
        };
      }),

    entries: (month: string, userId: string) =>
      withStaffTx(db, async (tx) => (await monthEntries(tx, month, userId)).map(entryDto)),

    addEntry: (actor: Actor, req: Request, b: TimeEntryBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('staff_time_entries')
          .values({
            user_id: b.userId,
            clock_in: b.clockIn,
            clock_out: b.clockOut,
            source: 'admin',
            note: b.note ?? null,
            edited_by: actor.userId,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await audit(tx, actor, req, 'timeclock.admin_add', 'staff_time_entry', row.id, {
          userId: b.userId,
          clockIn: b.clockIn,
          clockOut: b.clockOut,
        });
        return entryDto(row);
      }),

    updateEntry: (actor: Actor, req: Request, id: string, b: TimeEntryBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .updateTable('staff_time_entries')
          .set({
            clock_in: b.clockIn,
            clock_out: b.clockOut,
            note: b.note ?? null,
            edited_by: actor.userId,
          })
          .where('id', '=', id)
          .where('user_id', '=', b.userId)
          .returningAll()
          .executeTakeFirst();
        if (!row) throw notFound('time_entry');
        await audit(tx, actor, req, 'timeclock.admin_edit', 'staff_time_entry', id, {
          clockIn: b.clockIn,
          clockOut: b.clockOut,
        });
        return entryDto(row);
      }),

    deleteEntry: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .deleteFrom('staff_time_entries')
          .where('id', '=', id)
          .returning('user_id')
          .executeTakeFirst();
        if (!row) throw notFound('time_entry');
        await audit(tx, actor, req, 'timeclock.admin_delete', 'staff_time_entry', id, {
          userId: row.user_id,
        });
      }),

    setRate: (actor: Actor, req: Request, userId: string, hourlyRateMinor: number) =>
      withStaffTx(db, async (tx) => {
        await tx
          .insertInto('staff_pay_rates')
          .values({ user_id: userId, hourly_rate_minor: hourlyRateMinor, updated_by: actor.userId })
          .onConflict((oc) =>
            oc.columns(['club_id', 'user_id']).doUpdateSet({
              hourly_rate_minor: hourlyRateMinor,
              updated_by: actor.userId,
              updated_at: new Date(),
            }),
          )
          .execute();
        await audit(tx, actor, req, 'payroll.rate', 'staff', userId, { hourlyRateMinor });
        return { hourlyRateMinor };
      }),
  };
}
