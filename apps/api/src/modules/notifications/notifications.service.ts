import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  AlertDismissBody,
  AlertsDto,
  AnnouncementDto,
  CreateAnnouncementBody,
  NotificationListDto,
  NotificationPreferencesDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError } from '../../shared/errors';
import { pushStateFor } from './notify';

const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());
const DEFAULT_PREFS: NotificationPreferencesDto = {
  pushEnabled: true,
  membership: true,
  classes: true,
  club: true,
  coaching: true,
  marketing: false,
};

async function inbox(tx: Tx, userId: string): Promise<NotificationListDto> {
  const items = await tx
    .selectFrom('notifications')
    .select(['id', 'kind', 'category', 'params', 'link', 'created_at', 'read_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute();
  const unread = await tx
    .selectFrom('notifications')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .executeTakeFirstOrThrow();
  return {
    items: items.map((n) => ({
      id: n.id,
      kind: n.kind,
      category: n.category as NotificationListDto['items'][number]['category'],
      params: (n.params ?? {}) as Record<string, string | number | null>,
      link: n.link,
      createdAt: iso(n.created_at)!,
      readAt: iso(n.read_at),
    })),
    unread: Number(unread.n),
  };
}

async function prefs(tx: Tx, userId: string): Promise<NotificationPreferencesDto> {
  const marketing = await sql<{ ok: boolean }>`
    select exists (select 1 from public.members m
                   where m.user_id = ${userId} and public.has_consent(m.id, 'marketing')) as ok`
    .execute(tx)
    .then((r) => r.rows[0]!.ok);
  const p = await tx
    .selectFrom('notification_preferences')
    .select(['push_enabled', 'membership', 'classes', 'club', 'coaching'])
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return p
    ? {
        pushEnabled: p.push_enabled,
        membership: p.membership,
        classes: p.classes,
        club: p.club,
        coaching: p.coaching,
        marketing,
      }
    : { ...DEFAULT_PREFS, marketing };
}

export function createNotificationService(db: Kysely<DB>) {
  return {
    // ── Member side ─────────────────────────────────────────────────────────
    list: (actor: Actor) => withStaffTx(db, (tx) => inbox(tx, actor.userId)),
    markRead: (actor: Actor, ids?: string[]) =>
      withStaffTx(db, async (tx) => {
        let q = tx
          .updateTable('notifications')
          .set({ read_at: new Date() })
          .where('user_id', '=', actor.userId)
          .where('read_at', 'is', null);
        if (ids?.length) q = q.where('id', 'in', ids);
        await q.execute();
        return inbox(tx, actor.userId);
      }),
    preferences: (actor: Actor) => withStaffTx(db, (tx) => prefs(tx, actor.userId)),
    updatePreferences: (actor: Actor, patch: Partial<NotificationPreferencesDto>) =>
      withStaffTx(db, async (tx) => {
        const current = await prefs(tx, actor.userId);
        const next = { ...current, ...patch };
        if (patch.marketing !== undefined && patch.marketing !== current.marketing) {
          // Marketing is a consent (append-only history), not just a switch.
          const m = await tx
            .selectFrom('members')
            .select('id')
            .where('user_id', '=', actor.userId)
            .executeTakeFirst();
          if (!m) throw new AppError('BUSINESS_RULE', 'errors.member.not_linked');
          await tx
            .insertInto('member_consents')
            .values({
              member_id: m.id,
              type: 'marketing',
              version: 'v1',
              granted: patch.marketing,
              source: 'app',
            })
            .execute();
          await tx
            .updateTable('members')
            .set({ marketing_opt_in: patch.marketing })
            .where('id', '=', m.id)
            .execute();
        }
        const v = {
          push_enabled: next.pushEnabled,
          membership: next.membership,
          classes: next.classes,
          club: next.club,
          coaching: next.coaching,
        };
        await tx
          .insertInto('notification_preferences')
          .values({ user_id: actor.userId, ...v })
          .onConflict((oc) => oc.column('user_id').doUpdateSet(v))
          .execute();
        return next;
      }),
    registerToken: (actor: Actor, token: string, platform: string) =>
      withStaffTx(db, async (tx) => {
        // A device belongs to whoever signed in on it last.
        await tx
          .insertInto('push_tokens')
          .values({ token, user_id: actor.userId, platform })
          .onConflict((oc) =>
            oc
              .column('token')
              .doUpdateSet({ user_id: actor.userId, platform, last_seen_at: new Date() }),
          )
          .execute();
        return { ok: true as const };
      }),
    removeToken: (actor: Actor, token: string) =>
      withStaffTx(db, async (tx) => {
        await tx
          .deleteFrom('push_tokens')
          .where('token', '=', token)
          .where('user_id', '=', actor.userId)
          .execute();
        return { ok: true as const };
      }),

    // ── Staff side ──────────────────────────────────────────────────────────
    announce: (actor: Actor, req: Request, b: CreateAnnouncementBody) =>
      withStaffTx(db, async (tx) => {
        const a = await tx
          .insertInto('announcements')
          .values({ title: b.title, body: b.body, audience: b.audience, created_by: actor.userId })
          .returning('id')
          .executeTakeFirstOrThrow();
        const r = await sql`
          insert into public.notifications (user_id, kind, category, params, link, dedupe_key, push_status)
          select m.user_id, 'announcement', ${b.audience === 'marketing' ? 'marketing' : 'club'},
                 jsonb_build_object('title', ${b.title}::text, 'body', ${b.body}::text),
                 null, 'announcement:' || ${a.id}::text, ${pushStateFor(sql`m.user_id`)}
          from public.members m
          ${b.audience === 'active' ? sql`join public.member_current_status s on s.member_id = m.id and s.status in ('active', 'expiring_soon')` : sql``}
          where m.user_id is not null and m.deactivated_at is null
            ${b.audience === 'marketing' ? sql`and public.has_consent(m.id, 'marketing')` : sql``}
            and coalesce((select np.club from public.notification_preferences np
                          where np.user_id = m.user_id), true)
          on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
        `.execute(tx);
        const recipients = Number(r.numAffectedRows ?? 0);
        await tx.updateTable('announcements').set({ recipients }).where('id', '=', a.id).execute();
        await writeAudit(tx, actor, req, {
          action: 'announcement.send',
          entityType: 'announcement',
          entityId: a.id,
          diff: { after: { title: b.title, audience: b.audience, recipients } },
        });
        return { id: a.id, recipients };
      }),
    announcements: () =>
      withStaffTx(db, async (tx): Promise<AnnouncementDto[]> => {
        const rows = await tx
          .selectFrom('announcements as a')
          .leftJoin('profiles as p', 'p.id', 'a.created_by')
          .select([
            'a.id',
            'a.title',
            'a.body',
            'a.audience',
            'a.recipients',
            'a.created_at',
            'p.first_name',
            'p.last_name',
          ])
          .orderBy('a.created_at', 'desc')
          .limit(50)
          .execute();
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          audience: r.audience as AnnouncementDto['audience'],
          recipients: r.recipients,
          createdAt: iso(r.created_at)!,
          createdByName: r.first_name ? `${r.first_name} ${r.last_name ?? ''}`.trim() : null,
        }));
      }),

    /** Everything the front desk and the owner should act on today. */
    alerts: (actor: Actor, locale: string) =>
      withStaffTx(db, async (tx): Promise<AlertsDto> => {
        const s = await sql<{ inactive: number; expiring: number }>`
          select public.setting_int('alerts.inactive_days', 30) as inactive,
                 public.setting_int('alerts.expiring_days', 7) as expiring`
          .execute(tx)
          .then((r) => r.rows[0]!);
        const planName = sql<string>`coalesce(
          (select t.name from public.membership_plan_translations t where t.plan_id = o.plan_id and t.locale = ${locale}),
          (select t.name from public.membership_plan_translations t where t.plan_id = o.plan_id and t.locale = 'sr'))`;
        const member = sql`m.id as member_id, m.first_name || ' ' || m.last_name as name,
                           m.member_number, m.phone`;
        const canPayments = actor.permissions.has('payments.read');

        type Base = {
          member_id: string;
          name: string;
          member_number: string;
          phone: string | null;
        };
        const base = (r: Base) => ({
          memberId: r.member_id,
          name: r.name,
          memberNumber: r.member_number,
          phone: r.phone,
        });

        const expiring = await sql<
          Base & { plan_name: string; end_date: string; days_left: number }
        >`
          select ${member}, ${planName} as plan_name, o.end_date, o.days_left
          from public.membership_overview o
          join public.members m on m.id = o.member_id and m.deactivated_at is null
          where o.state = 'active' and o.days_left between 0 and ${s.expiring}
            and not exists (select 1 from public.alert_dismissals ad where ad.kind = 'expiring'
                            and ad.member_id = m.id and ad.until >= public.club_today())
            and not exists (select 1 from public.memberships n
                            where n.member_id = o.member_id and n.state <> 'cancelled' and n.id <> o.id
                              and n.start_date > o.start_date)
          order by o.days_left, name limit 100`
          .execute(tx)
          .then((r) => r.rows);

        const debts = canPayments
          ? await sql<Base & { plan_name: string; amount: number; currency: string }>`
              select ${member}, ${planName} as plan_name,
                     (o.price_amount - o.paid_amount)::int as amount, o.currency
              from public.membership_overview o
              join public.members m on m.id = o.member_id and m.deactivated_at is null
              where o.state not in ('cancelled', 'pending') and o.price_amount > o.paid_amount
            and not exists (select 1 from public.alert_dismissals ad where ad.kind = 'debts'
                            and ad.member_id = m.id and ad.until >= public.club_today())
              order by amount desc limit 100`
              .execute(tx)
              .then((r) => r.rows)
          : [];

        const inactive = await sql<Base & { last_visit: Date | null; days_since: number | null }>`
          select ${member}, lv.last_visit,
                 (public.club_today() - (lv.last_visit at time zone 'Europe/Belgrade')::date) as days_since
          from public.member_current_status cs
          join public.members m on m.id = cs.member_id and m.deactivated_at is null
          left join lateral (select max(v.started_at) as last_visit from public.visits v
                             where v.member_id = m.id) lv on true
          where cs.status in ('active', 'expiring_soon')
            and coalesce(lv.last_visit, m.created_at) < now() - make_interval(days => ${s.inactive})
            and not exists (select 1 from public.alert_dismissals ad where ad.kind = 'inactive'
                            and ad.member_id = m.id and ad.until >= public.club_today())
          order by lv.last_visit nulls first limit 100`
          .execute(tx)
          .then((r) => r.rows);

        const birthdays = await sql<Base & { date: string; in_days: number; age: number | null }>`
          select ${member}, b.next::text as date, (b.next - public.club_today()) as in_days,
                 extract(year from age(b.next, m.date_of_birth))::int as age
          from public.members m
          cross join lateral (
            select (m.date_of_birth + make_interval(years =>
                     extract(year from age(public.club_today(), m.date_of_birth))::int))::date as last
          ) y
          cross join lateral (
            select case when y.last = public.club_today() then y.last
                        else (y.last + interval '1 year')::date end as next
          ) b
          where m.date_of_birth is not null and m.deactivated_at is null
            and b.next between public.club_today() and public.club_today() + 7
            and not exists (select 1 from public.alert_dismissals ad where ad.kind = 'birthdays'
                            and ad.member_id = m.id and ad.until >= public.club_today())
          order by in_days, name limit 100`
          .execute(tx)
          .then((r) => r.rows);

        const signups = await sql<Base & { created_at: Date; has_membership: boolean }>`
          select ${member}, m.created_at,
                 exists (select 1 from public.memberships x where x.member_id = m.id and x.state <> 'cancelled')
                   as has_membership
          from public.members m
          where m.deactivated_at is null and m.created_at > now() - interval '7 days'
            and not exists (select 1 from public.alert_dismissals ad where ad.kind = 'signups'
                            and ad.member_id = m.id and ad.until >= public.club_today())
          order by m.created_at desc limit 100`
          .execute(tx)
          .then((r) => r.rows);

        const requests = await sql<
          Base & {
            membership_id: string;
            plan_name: string;
            price_amount: number;
            currency: string;
            created_at: Date;
          }
        >`
          select ${member}, o.id as membership_id, ${planName} as plan_name, o.price_amount, o.currency, o.created_at
          from public.membership_overview o
          join public.members m on m.id = o.member_id
          where o.state = 'pending'
          order by o.created_at limit 100`
          .execute(tx)
          .then((r) => r.rows);

        // F13-2: pause requests waiting for a decision.
        const pauses = await sql<
          Base & {
            pause_id: string;
            plan_name: string;
            starts_on: string;
            ends_on: string;
            created_at: Date;
          }
        >`
          select ${member}, mp.id as pause_id, ${planName} as plan_name,
                 mp.starts_on::text, mp.ends_on::text, mp.created_at
          from public.membership_pauses mp
          join public.membership_overview o on o.id = mp.membership_id
          join public.members m on m.id = o.member_id
          where mp.status = 'requested'
          order by mp.created_at limit 100`
          .execute(tx)
          .then((r) => r.rows);

        return {
          settings: { inactiveDays: s.inactive, expiringDays: s.expiring },
          pauseRequests: pauses.map((r) => ({
            ...base(r),
            pauseId: r.pause_id,
            planName: r.plan_name,
            startsOn: r.starts_on,
            endsOn: r.ends_on,
            createdAt: iso(r.created_at)!,
          })),
          requests: requests.map((r) => ({
            ...base(r),
            membershipId: r.membership_id,
            planName: r.plan_name,
            amount: r.price_amount,
            currency: r.currency,
            createdAt: iso(r.created_at)!,
          })),
          expiring: expiring.map((r) => ({
            ...base(r),
            planName: r.plan_name,
            endDate: String(r.end_date),
            daysLeft: r.days_left,
          })),
          debts: debts.map((r) => ({
            ...base(r),
            planName: r.plan_name,
            amount: r.amount,
            currency: r.currency,
          })),
          inactive: inactive.map((r) => ({
            ...base(r),
            lastVisitAt: iso(r.last_visit),
            daysSince: r.days_since,
          })),
          birthdays: birthdays.map((r) => ({
            ...base(r),
            date: r.date,
            inDays: r.in_days,
            age: r.age,
          })),
          signups: signups.map((r) => ({
            ...base(r),
            createdAt: iso(r.created_at)!,
            hasMembership: r.has_membership,
          })),
        };
      }),

    /** Hide an alert row until a date (e.g. a debt after calling the member). */
    dismissAlert: (actor: Actor, req: Request, b: AlertDismissBody) =>
      withStaffTx(db, async (tx) => {
        const until = sql<string>`public.club_today() + ${b.days}::int`;
        await tx
          .insertInto('alert_dismissals')
          .values({ kind: b.kind, member_id: b.memberId, until, created_by: actor.userId })
          .onConflict((oc) =>
            oc
              .columns(['club_id', 'kind', 'member_id'])
              .doUpdateSet({ until, created_by: actor.userId }),
          )
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'alert.dismiss',
          entityType: 'member',
          entityId: b.memberId,
          diff: { after: { kind: b.kind, days: b.days } },
        });
        return { ok: true };
      }),
  };
}
