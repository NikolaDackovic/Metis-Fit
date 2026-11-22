import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { GymBusyDto, BusyLevel, BusySettings } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { currentClubId } from '../../shared/club-context';

/**
 * F13-1 "How busy is the gym". Counts open visits (a visit opens on entry and closes on check-out
 * or automatically after `visits.auto_close_hours`). Only numbers leave this module, never names.
 */
const TZ = 'Europe/Belgrade';
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: GymBusyDto }>();

async function settingsOf(tx: Tx): Promise<BusySettings> {
  const rows = await tx
    .selectFrom('settings')
    .select(['key', 'value'])
    .where('key', 'in', ['occupancy.visible', 'occupancy.capacity'])
    .execute();
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const cap = get('occupancy.capacity');
  return {
    visible: get('occupancy.visible') !== false,
    capacity: typeof cap === 'number' && cap > 0 ? cap : null,
  };
}

/** Low / medium / high: against the capacity, else against this weekday's busiest hour. */
export function levelOf(now: number, capacity: number | null, peak: number): BusyLevel | null {
  if (capacity) {
    const p = now / capacity;
    return p < 0.4 ? 'low' : p < 0.75 ? 'medium' : 'high';
  }
  if (peak < 3) return null;
  const p = now / peak;
  return p < 0.5 ? 'low' : p < 0.9 ? 'medium' : 'high';
}

async function compute(tx: Tx): Promise<GymBusyDto> {
  const cfg = await settingsOf(tx);
  const clock = await sql<{ hour: number; dow: number }>`
    select extract(hour from now() at time zone ${TZ})::int as hour,
           extract(isodow from now() at time zone ${TZ})::int as dow`
    .execute(tx)
    .then((r) => r.rows[0]!);
  if (!cfg.visible)
    return {
      visible: false,
      now: null,
      capacity: null,
      level: null,
      typical: [],
      currentHour: clock.hour,
    };

  const hours = sql`public.setting_int('visits.auto_close_hours', 5)`;
  const now = await sql<{ n: number }>`
    select count(*)::int as n from public.visits
    where ended_at is null and started_at > now() - make_interval(hours => ${hours})`
    .execute(tx)
    .then((r) => r.rows[0]!.n);

  // The same weekday in the last 8 weeks (only since the first visit ever), people present at :30.
  const typical = await sql<{ hour: number; people: number }>`
    with first as (
      select min((started_at at time zone ${TZ})::date) as d from public.visits
    ), days as (
      select (public.club_today() - 7 * k) as day
      from generate_series(1, 8) k, first
      where first.d is not null and public.club_today() - 7 * k >= first.d
    ), slots as (
      select h, ((day + make_time(h, 30, 0)) at time zone ${TZ}) as t
      from days cross join generate_series(0, 23) h
    )
    select s.h as hour,
           round(avg((select count(*) from public.visits v
                      where v.started_at <= s.t
                        and coalesce(v.ended_at, v.started_at + make_interval(hours => ${hours})) > s.t
                     ))::numeric, 1)::float8 as people
    from slots s group by s.h order by s.h`
    .execute(tx)
    .then((r) => r.rows);

  // Only the hours the gym is open today.
  const open = await tx
    .selectFrom('opening_hours')
    .select(['opens_at', 'closes_at', 'is_closed'])
    .where('weekday', '=', clock.dow)
    .executeTakeFirst();
  const hourOf = (t: string | null | undefined) => (t ? Number(t.slice(0, 2)) : null);
  const from = open && !open.is_closed ? hourOf(open.opens_at) : null;
  let to = open && !open.is_closed ? hourOf(open.closes_at) : null;
  if (to === 0) to = 24;
  const shown = open?.is_closed
    ? []
    : from === null || to === null
      ? typical
      : typical.filter((x) => x.hour >= from && x.hour < to);

  const peak = Math.max(0, ...shown.map((x) => x.people));
  return {
    visible: true,
    now,
    capacity: cfg.capacity,
    level: levelOf(now, cfg.capacity, peak),
    typical: shown,
    currentHour: clock.hour,
  };
}

export function createOccupancyService(db: Kysely<DB>) {
  return {
    /** Public: cached for a minute per gym (the numbers change slowly, the query is not free). */
    get: async (): Promise<GymBusyDto> => {
      const key = currentClubId() ?? 'default';
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
      const data = await withStaffTx(db, compute);
      cache.set(key, { at: Date.now(), data });
      return data;
    },

    settings: () => withStaffTx(db, settingsOf),

    updateSettings: (actor: Actor, req: Request, body: BusySettings) =>
      withStaffTx(db, async (tx) => {
        const before = await settingsOf(tx);
        for (const [key, value] of [
          ['occupancy.visible', body.visible],
          ['occupancy.capacity', body.capacity],
        ] as const) {
          const v = JSON.stringify(value);
          await tx
            .insertInto('settings')
            .values({ key, value: v, updated_by: actor.userId })
            .onConflict((oc) =>
              oc.columns(['club_id', 'key']).doUpdateSet({ value: v, updated_by: actor.userId }),
            )
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'occupancy.settings',
          entityType: 'settings',
          entityId: null,
          diff: { before, after: body },
        });
        cache.delete(currentClubId() ?? 'default');
        return body;
      }),
  };
}
