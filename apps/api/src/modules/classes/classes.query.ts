import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { ClassAdminDto, ClassRulesDto, ClassSessionDto } from '@grit/validation';
import type { Tx } from '../../database/tx';
import { AppError } from '../../shared/errors';

/** Booking rules from settings (DECISIONS A15 defaults). */
export async function loadRules(tx: Tx | Kysely<DB>): Promise<ClassRulesDto> {
  const r = await sql<{
    window: number;
    cutoff: number;
    strikes: number;
    strike_days: number;
    ban: number;
  }>`
    select public.setting_int('classes.booking_window_days', 7) as window,
           public.setting_int('classes.cancel_cutoff_minutes', 120) as cutoff,
           public.setting_int('classes.strike_limit', 3) as strikes,
           public.setting_int('classes.strike_window_days', 30) as strike_days,
           public.setting_int('classes.ban_days', 7) as ban
  `
    .execute(tx)
    .then((x) => x.rows[0]!);
  return {
    bookingWindowDays: r.window,
    cancelCutoffMinutes: r.cutoff,
    strikeLimit: r.strikes,
    strikeWindowDays: r.strike_days,
    banDays: r.ban,
  };
}

let lastGenerated = 0;
/** Creates upcoming sessions from the weekly series. Idempotent; throttled for read paths. */
export async function ensureSessions(tx: Tx | Kysely<DB>, force = false) {
  if (!force && Date.now() - lastGenerated < 10 * 60_000) return;
  await sql`select public.generate_class_sessions(
    public.club_today() + public.setting_int('classes.generate_ahead_days', 28))`.execute(tx);
  lastGenerated = Date.now();
}
export const resetGenerationThrottle = () => {
  lastGenerated = 0;
};

interface Row {
  id: string;
  class_type_id: string;
  type_key: string;
  type_name: string | null;
  color: string;
  zone: string;
  trainer_id: string | null;
  trainer_name: string | null;
  trainer_public: boolean | null;
  starts_at: Date;
  ends_at: Date;
  capacity: number;
  booked: number;
  waitlisted: number;
  room_key: string | null;
  room_name: string | null;
  note: string | null;
  status: 'scheduled' | 'cancelled';
  series_id: string | null;
  cancelled_reason: string | null;
}

/**
 * Localized sessions with live booking counts. Runs on the privileged connection (counts include
 * other members' bookings), but returns only aggregate numbers, never who booked.
 */
export async function querySessions(
  tx: Tx,
  locale: string,
  f: { from?: string; to?: string; ids?: string[]; typeKey?: string },
): Promise<Row[]> {
  if (f.ids && f.ids.length === 0) return [];
  return sql<Row>`
    select c.id, c.class_type_id, ct.key as type_key, coalesce(t.name, tsr.name) as type_name,
           ct.color, z.key as zone,
           c.trainer_id, tr.first_name || ' ' || tr.last_name as trainer_name,
           (tr.is_public and tr.archived_at is null) as trainer_public,
           c.starts_at, c.ends_at, c.capacity, c.room_key, c.note, c.status, c.series_id,
           c.cancelled_reason,
           coalesce(bc.booked, 0)::int as booked, coalesce(bc.waitlisted, 0)::int as waitlisted,
           room.name as room_name
    from public.classes c
    join public.class_types ct on ct.id = c.class_type_id
    join public.zones z on z.id = ct.zone_id
    left join public.class_type_translations t on t.class_type_id = ct.id and t.locale = ${locale}
    left join public.class_type_translations tsr on tsr.class_type_id = ct.id and tsr.locale = 'sr'
    left join public.trainers tr on tr.id = c.trainer_id
    left join lateral (
      select count(*) filter (where b.status in ('confirmed', 'attended', 'no_show')) as booked,
             count(*) filter (where b.status = 'waitlisted') as waitlisted
      from public.bookings b where b.class_id = c.id
    ) bc on true
    left join lateral (
      select coalesce(rt.name, rts.name) as name
      from public.rooms r
      join public.floors fl on fl.id = r.floor_id
      join public.map_versions v on v.id = fl.map_version_id and v.status = 'published'
      left join public.room_translations rt on rt.room_id = r.id and rt.locale = ${locale}
      left join public.room_translations rts on rts.room_id = r.id and rts.locale = 'sr'
      where r.key = c.room_key and not r.is_hidden
      limit 1
    ) room on true
    where (${f.from ?? null}::date is null
           or c.starts_at >= (${f.from ?? null}::date)::timestamp at time zone 'Europe/Belgrade')
      and (${f.to ?? null}::date is null
           or c.starts_at < ((${f.to ?? null}::date) + 1)::timestamp at time zone 'Europe/Belgrade')
      and (${f.ids ? sql`c.id in (${sql.join(f.ids)})` : sql`true`})
      and (${f.typeKey ?? null}::text is null or ct.key = ${f.typeKey ?? null})
    order by c.starts_at, coalesce(t.name, tsr.name)
  `
    .execute(tx)
    .then((r) => r.rows);
}

export function toSessionDto(
  r: Row,
  rules: ClassRulesDto,
  opts: { admin?: boolean } = {},
): ClassSessionDto {
  const startsAt = new Date(r.starts_at);
  const showTrainer = r.trainer_id && r.trainer_name && (opts.admin || r.trainer_public);
  return {
    id: r.id,
    classTypeId: r.class_type_id,
    typeKey: r.type_key,
    typeName: r.type_name ?? r.type_key,
    color: r.color,
    zone: r.zone,
    trainer: showTrainer ? { id: r.trainer_id!, name: r.trainer_name! } : null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    capacity: r.capacity,
    booked: r.booked,
    waitlisted: r.waitlisted,
    spotsLeft: Math.max(0, r.capacity - r.booked),
    roomKey: r.room_key,
    roomName: r.room_name,
    note: r.note,
    status: r.status,
    bookingOpensAt: new Date(
      startsAt.getTime() - rules.bookingWindowDays * 86_400_000,
    ).toISOString(),
  };
}

export const toAdminDto = (r: Row, rules: ClassRulesDto): ClassAdminDto => ({
  ...toSessionDto(r, rules, { admin: true }),
  seriesId: r.series_id,
  cancelledReason: r.cancelled_reason,
});

const DAY = 86_400_000;
/** Limits how much of the schedule one request may read. */
export function assertRange(from: string, to: string, maxDays: number) {
  if ((Date.parse(to) - Date.parse(from)) / DAY > maxDays)
    throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
      { path: 'to', message: 'validation.range_too_long' },
    ]);
}
