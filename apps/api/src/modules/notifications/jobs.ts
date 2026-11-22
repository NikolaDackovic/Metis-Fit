import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Logger } from 'pino';
import type { DB } from '@grit/database';
import { categoryAllowed, pushStateFor } from './notify';
import { awardChallenges } from '../challenges/challenges.service';
import { deliverPending, type PushSender } from './push';

/**
 * Scheduled automations. Each is one set-based INSERT … SELECT with a dedupe key, so running
 * the job any number of times (or on several servers) yields each notification exactly once.
 * Club dates use Europe/Belgrade (`public.club_today()`).
 */
const ON_CONFLICT = sql`on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`;
const uid = sql`m.user_id`;

async function membershipExpiring(db: Kysely<DB>) {
  // 7, 3 and 1 day before the end, unless the member already has a following membership.
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'membership_expiring', 'membership',
           jsonb_build_object('days', o.days_left, 'plan', coalesce(tl.name, ts.name), 'endDate', o.end_date),
           '/membership', 'expiring:' || o.id || ':' || o.days_left, ${pushStateFor(uid)}
    from public.membership_overview o
    join public.members m on m.id = o.member_id and m.user_id is not null and m.deactivated_at is null
    join public.profiles p on p.id = m.user_id
    left join public.membership_plan_translations tl on tl.plan_id = o.plan_id and tl.locale = p.locale
    left join public.membership_plan_translations ts on ts.plan_id = o.plan_id and ts.locale = 'sr'
    where o.state = 'active' and o.days_left in (7, 3, 1)
      and not exists (select 1 from public.memberships n
                      where n.member_id = o.member_id and n.state <> 'cancelled' and n.id <> o.id
                        and n.start_date > o.start_date)
      and ${categoryAllowed(uid, 'membership')}
    ${ON_CONFLICT}
  `.execute(db);
}

async function membershipExpired(db: Kysely<DB>) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'membership_expired', 'membership',
           jsonb_build_object('plan', coalesce(tl.name, ts.name)),
           '/membership', 'expired:' || ms.id, ${pushStateFor(uid)}
    from public.memberships ms
    join public.members m on m.id = ms.member_id and m.user_id is not null and m.deactivated_at is null
    join public.profiles p on p.id = m.user_id
    left join public.membership_plan_translations tl on tl.plan_id = ms.plan_id and tl.locale = p.locale
    left join public.membership_plan_translations ts on ts.plan_id = ms.plan_id and ts.locale = 'sr'
    where ms.state <> 'cancelled' and ms.end_date between public.club_today() - 3 and public.club_today() - 1
      and not exists (select 1 from public.memberships n
                      where n.member_id = ms.member_id and n.state <> 'cancelled' and n.id <> ms.id
                        and coalesce(n.end_date, 'infinity'::date) >= public.club_today())
      and ${categoryAllowed(uid, 'membership')}
    ${ON_CONFLICT}
  `.execute(db);
}

async function classReminders(db: Kysely<DB>) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'class_reminder', 'classes',
           jsonb_build_object('class', coalesce(tl.name, ts.name), 'startsAt', c.starts_at),
           '/classes', 'class:' || b.id, ${pushStateFor(uid)}
    from public.bookings b
    join public.classes c on c.id = b.class_id and c.status = 'scheduled'
    join public.members m on m.id = b.member_id and m.user_id is not null
    join public.profiles p on p.id = m.user_id
    left join public.class_type_translations tl on tl.class_type_id = c.class_type_id and tl.locale = p.locale
    left join public.class_type_translations ts on ts.class_type_id = c.class_type_id and ts.locale = 'sr'
    where b.status = 'confirmed'
      and c.starts_at > now()
      and c.starts_at <= now() + make_interval(hours => public.setting_int_for(c.club_id, 'notifications.class_reminder_hours', 2))
      and ${categoryAllowed(uid, 'classes')}
    ${ON_CONFLICT}
  `.execute(db);
}

/**
 * F14-6: sessions with a trainer (personal training, consultations). A day before (only when it
 * was booked earlier than that) and an hour before. Dedupe keys keep it to one of each.
 */
async function appointmentReminders(db: Kysely<DB>) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'pt_reminder', 'classes',
           jsonb_build_object('trainer', t.first_name || ' ' || t.last_name, 'startsAt', a.starts_at),
           '/classes', w.key || a.id, ${pushStateFor(uid)}
    from public.trainer_appointments a
    join public.trainers t on t.id = a.trainer_id
    join public.members m on m.id = a.member_id and m.user_id is not null and m.deactivated_at is null
    cross join lateral (values
      ('pt:day:', interval '24 hours', interval '3 hours'),
      ('pt:hour:', interval '1 hour', interval '0 hours')
    ) as w(key, ahead, floor)
    where a.status = 'scheduled'
      and a.starts_at > now() + w.floor
      and a.starts_at <= now() + w.ahead
      and (w.key <> 'pt:day:' or a.created_at <= a.starts_at - interval '24 hours')
      and ${categoryAllowed(uid, 'classes')}
    ${ON_CONFLICT}
  `.execute(db);
}

/** F13-7: 20 minutes to 3 hours after a group class, ask how it was (once, if not rated yet). */
async function ratingPrompts(db: Kysely<DB>) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'rating_prompt', 'classes',
           jsonb_build_object('class', coalesce(tl.name, ts.name)),
           '/', 'rate:' || b.id, ${pushStateFor(uid)}
    from public.bookings b
    join public.classes c on c.id = b.class_id and c.status = 'scheduled'
    join public.members m on m.id = b.member_id and m.user_id is not null and m.deactivated_at is null
    join public.profiles p on p.id = m.user_id
    left join public.class_type_translations tl on tl.class_type_id = c.class_type_id and tl.locale = p.locale
    left join public.class_type_translations ts on ts.class_type_id = c.class_type_id and ts.locale = 'sr'
    where b.status in ('confirmed', 'attended')
      and c.ends_at between now() - interval '3 hours' and now() - interval '20 minutes'
      and not exists (select 1 from public.ratings r where r.booking_id = b.id)
      and ${categoryAllowed(uid, 'classes')}
    ${ON_CONFLICT}
  `.execute(db);
}

async function birthdays(db: Kysely<DB>) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'birthday', 'club', jsonb_build_object('name', m.first_name), null,
           'birthday:' || extract(year from public.club_today())::int, ${pushStateFor(uid)}
    from public.members m
    where m.user_id is not null and m.deactivated_at is null and m.date_of_birth is not null
      and to_char(m.date_of_birth, 'MM-DD') = to_char(public.club_today(), 'MM-DD')
      and ${categoryAllowed(uid, 'club')}
    ${ON_CONFLICT}
  `.execute(db);
}

// ── Coaching (healthy-life nudges) ────────────────────────────────────────────
// Sent at sensible local times; `at` is "now" (a parameter so the time windows can be tested).
const TZ = 'Europe/Belgrade';
const local = (at: Date) => sql`(${at.toISOString()}::timestamptz at time zone ${TZ})`;
const today = (at: Date) => sql`(${local(at)})::date`;
const activeMember = sql`m.user_id is not null and m.deactivated_at is null`;

/** Monday 08-11: last week's numbers (workouts + classes, visit days, activity minutes). */
async function weeklyReport(db: Kysely<DB>, at: Date) {
  const mon = sql`(${today(at)} - (extract(isodow from ${today(at)})::int - 1) - 7)`;
  const inWeek = (d: RawBuilder<unknown>) => sql`${d} between ${mon} and ${mon} + 6`;
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'weekly_report', 'coaching',
           jsonb_build_object('workouts', ws.n + cl.n, 'visits', v.n, 'minutes', a.n),
           '/', 'week:' || ${mon}, ${pushStateFor(uid)}
    from public.members m
    cross join lateral (select count(*)::int n from public.workout_sessions s
      where s.user_id = m.user_id and s.deleted_at is null
        and ${inWeek(sql`(s.started_at at time zone ${TZ})::date`)}) ws
    cross join lateral (select count(*)::int n from public.bookings b
      join public.classes c on c.id = b.class_id
      where b.member_id = m.id and b.status = 'attended'
        and ${inWeek(sql`(c.starts_at at time zone ${TZ})::date`)}) cl
    cross join lateral (select count(distinct (aa.occurred_at at time zone ${TZ})::date)::int n
      from public.attendance_attempts aa
      where aa.member_id = m.id and aa.result = 'granted'
        and ${inWeek(sql`(aa.occurred_at at time zone ${TZ})::date`)}) v
    cross join lateral (select coalesce(sum(ac.duration_min), 0)::int n from public.activities ac
      where ac.user_id = m.user_id and ${inWeek(sql`ac.done_on`)}) a
    where ${activeMember}
      and extract(isodow from ${local(at)}) = 1 and extract(hour from ${local(at)}) between 8 and 10
      and ws.n + cl.n + v.n + a.n > 0
      and ${categoryAllowed(uid, 'coaching')}
    ${ON_CONFLICT}
  `.execute(db);
}

/** 17-19 h, at most once a week: an active member with nothing done in 5 days and nothing booked. */
async function trainingNudge(db: Kysely<DB>, at: Date) {
  const since = sql`(${today(at)} - 5)`;
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'training_nudge', 'coaching', '{}'::jsonb, '/classes',
           'nudge:' || to_char(${today(at)}, 'IYYY-IW'), ${pushStateFor(uid)}
    from public.members m
    where ${activeMember}
      and extract(hour from ${local(at)}) between 17 and 18
      and exists (select 1 from public.membership_overview o
                  where o.member_id = m.id and o.state = 'active' and o.start_date <= ${since})
      and not exists (select 1 from public.workout_sessions s where s.user_id = m.user_id
                      and s.deleted_at is null and (s.started_at at time zone ${TZ})::date > ${since})
      and not exists (select 1 from public.attendance_attempts aa where aa.member_id = m.id
                      and aa.result = 'granted' and (aa.occurred_at at time zone ${TZ})::date > ${since})
      and not exists (select 1 from public.activities ac where ac.user_id = m.user_id and ac.done_on > ${since})
      and not exists (select 1 from public.bookings b join public.classes c on c.id = b.class_id
                      where b.member_id = m.id and b.status in ('confirmed', 'attended')
                        and (c.starts_at at time zone ${TZ})::date > ${since})
      and ${categoryAllowed(uid, 'coaching')}
    ${ON_CONFLICT}
  `.execute(db);
}

/** Saturday 09-12, once a month: members who measure, with the last measurement over 30 days old. */
async function measureNudge(db: Kysely<DB>, at: Date) {
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select m.club_id, m.user_id, 'measure_nudge', 'coaching', '{}'::jsonb, '/classes',
           'measure:' || to_char(${today(at)}, 'YYYY-MM'), ${pushStateFor(uid)}
    from public.members m
    join lateral (select max(bm.measured_on) as last from public.body_measurements bm
                  where bm.user_id = m.user_id) x on x.last is not null
    where ${activeMember}
      and extract(isodow from ${local(at)}) = 6 and extract(hour from ${local(at)}) between 9 and 11
      and x.last < ${today(at)} - 30
      and ${categoryAllowed(uid, 'coaching')}
    ${ON_CONFLICT}
  `.execute(db);
}

/**
 * F14-7: 06-09 h, a trainer's day at a glance (group classes they lead and sessions with
 * members), once a day and only when there is something on.
 */
async function trainerDay(db: Kysely<DB>, at: Date) {
  const tuid = sql`t.user_id`;
  const onDay = (ts: RawBuilder<unknown>) => sql`(${ts} at time zone ${TZ})::date = ${today(at)}`;
  return sql`
    insert into public.notifications (club_id, user_id, kind, category, params, link, dedupe_key, push_status)
    select t.club_id, t.user_id, 'trainer_day', 'classes',
           jsonb_build_object('classes', cl.n, 'sessions', ap.n, 'startsAt', least(cl.first, ap.first)),
           '/coach', 'tday:' || t.id || ':' || ${today(at)}, ${pushStateFor(tuid)}
    from public.trainers t
    cross join lateral (select count(*)::int n, min(c.starts_at) first from public.classes c
      where c.trainer_id = t.id and c.status = 'scheduled' and ${onDay(sql`c.starts_at`)}) cl
    cross join lateral (select count(*)::int n, min(a.starts_at) first from public.trainer_appointments a
      where a.trainer_id = t.id and a.status = 'scheduled' and ${onDay(sql`a.starts_at`)}) ap
    where t.user_id is not null and t.archived_at is null
      and extract(hour from ${local(at)}) between 6 and 9
      and cl.n + ap.n > 0
      and ${categoryAllowed(tuid, 'classes')}
    ${ON_CONFLICT}
  `.execute(db);
}

export interface JobResult {
  created: number;
  pushed: number;
}

/** One pass of every automation, then push delivery. */
export async function runNotificationJobs(
  db: Kysely<DB>,
  push: PushSender | null,
  at = new Date(),
): Promise<JobResult> {
  let created = 0;
  for (const job of [
    membershipExpiring,
    membershipExpired,
    classReminders,
    appointmentReminders,
    birthdays,
    ratingPrompts,
  ]) {
    const r = await job(db);
    created += Number(r.numAffectedRows ?? 0);
  }
  for (const job of [weeklyReport, trainingNudge, measureNudge, trainerDay]) {
    const r = await job(db, at);
    created += Number(r.numAffectedRows ?? 0);
  }
  // F13-4: points for challenges reached (also given when the member opens them).
  created += await awardChallenges(db);
  const pushed = await deliverPending(db, push);
  return { created, pushed };
}

/**
 * Runs the jobs every `everyMs`. A Postgres advisory lock makes sure only one API instance
 * works at a time (the dedupe index would prevent duplicates anyway; the lock saves work).
 */
export function startNotificationScheduler(
  db: Kysely<DB>,
  push: PushSender | null,
  logger: Logger,
  everyMs = 5 * 60_000,
) {
  const LOCK = 82_001;
  const tick = async () => {
    try {
      await db.connection().execute(async (conn) => {
        const got = await sql<{ ok: boolean }>`select pg_try_advisory_lock(${LOCK}) as ok`.execute(
          conn,
        );
        if (!got.rows[0]?.ok) return;
        try {
          const r = await runNotificationJobs(conn, push);
          if (r.created || r.pushed) logger.info(r, 'notification jobs');
        } finally {
          await sql`select pg_advisory_unlock(${LOCK})`.execute(conn);
        }
      });
    } catch (err) {
      logger.error({ err }, 'notification jobs failed');
    }
  };
  const first = setTimeout(() => void tick(), 10_000);
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref();
  first.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
