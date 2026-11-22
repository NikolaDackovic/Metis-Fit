import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { DB } from '@grit/database';
import type { NotificationCategory, NotificationKind } from '@grit/validation';
import type { Tx } from '../../database/tx';

/**
 * Notification writer. Every automatic message has a dedupe key; the partial unique index
 * (user_id, dedupe_key) turns a second attempt into a no-op, so jobs are safe to repeat.
 * Category switches in the user's preferences are respected at write time.
 */

/** 'pending' when the user wants push and has a device registered, else 'none'. */
export const pushStateFor = (userId: RawBuilder<unknown>) => sql<string>`
  case when coalesce((select np.push_enabled from public.notification_preferences np
                      where np.user_id = ${userId}), true)
        and exists (select 1 from public.push_tokens t where t.user_id = ${userId})
       then 'pending' else 'none' end`;

/** SQL condition: the user has not switched this category off. */
export const categoryAllowed = (userId: RawBuilder<unknown>, category: NotificationCategory) =>
  category === 'marketing'
    ? // Promotions only with the member's explicit, current marketing consent.
      sql<boolean>`exists (select 1 from public.members mm
                           where mm.user_id = ${userId} and public.has_consent(mm.id, 'marketing'))`
    : sql<boolean>`coalesce((select np.${sql.ref(category)} from public.notification_preferences np
                             where np.user_id = ${userId}), true)`;

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  category: NotificationCategory;
  params?: Record<string, string | number | null>;
  link?: string | null;
  dedupeKey?: string | null;
}

/** Insert one notification (no-op when the category is off or the dedupe key was used). */
export async function notify(tx: Tx | Kysely<DB>, n: NotifyInput): Promise<boolean> {
  const uid = sql`${n.userId}::uuid`;
  const r = await sql`
    insert into public.notifications (user_id, kind, category, params, link, dedupe_key, push_status)
    select ${n.userId}, ${n.kind}, ${n.category}, ${JSON.stringify(n.params ?? {})}::jsonb,
           ${n.link ?? null}, ${n.dedupeKey ?? null}, ${pushStateFor(uid)}
    where ${categoryAllowed(uid, n.category)}
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  `.execute(tx);
  return Number(r.numAffectedRows ?? 0) > 0;
}

/** Waitlist → confirmed: tell each promoted member (called inside the booking transaction). */
export async function notifyWaitlistPromoted(tx: Tx, bookingIds: string[]) {
  if (!bookingIds.length) return;
  await sql`
    insert into public.notifications (user_id, kind, category, params, link, dedupe_key, push_status)
    select m.user_id, 'waitlist_promoted', 'classes',
           jsonb_build_object('class', coalesce(tl.name, ts.name), 'startsAt', c.starts_at),
           '/classes', 'promoted:' || b.id, ${pushStateFor(sql`m.user_id`)}
    from public.bookings b
    join public.members m on m.id = b.member_id and m.user_id is not null
    join public.profiles p on p.id = m.user_id
    join public.classes c on c.id = b.class_id
    left join public.class_type_translations tl on tl.class_type_id = c.class_type_id and tl.locale = p.locale
    left join public.class_type_translations ts on ts.class_type_id = c.class_type_id and ts.locale = 'sr'
    where b.id = any(${bookingIds}::uuid[]) and ${categoryAllowed(sql`m.user_id`, 'classes')}
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  `.execute(tx);
}

/** A class was cancelled by the club: tell everyone who was booked or waiting. */
export async function notifyClassCancelled(tx: Tx, bookingIds: string[]) {
  if (!bookingIds.length) return;
  await sql`
    insert into public.notifications (user_id, kind, category, params, link, dedupe_key, push_status)
    select m.user_id, 'class_cancelled', 'classes',
           jsonb_build_object('class', coalesce(tl.name, ts.name), 'startsAt', c.starts_at),
           '/classes', 'class_cancelled:' || b.id, ${pushStateFor(sql`m.user_id`)}
    from public.bookings b
    join public.members m on m.id = b.member_id and m.user_id is not null
    join public.profiles p on p.id = m.user_id
    join public.classes c on c.id = b.class_id
    left join public.class_type_translations tl on tl.class_type_id = c.class_type_id and tl.locale = p.locale
    left join public.class_type_translations ts on ts.class_type_id = c.class_type_id and ts.locale = 'sr'
    where b.id = any(${bookingIds}::uuid[])
      and ${categoryAllowed(sql`m.user_id`, 'classes')}
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  `.execute(tx);
}
