import { sql, type Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DB } from '@grit/database';
import { PLATFORM_NAME } from '@grit/design-tokens';
import { INTL_LOCALE, normalizeLocale, resources } from '@grit/translations';

/** Push delivery. The provider is pluggable; without one, pending pushes are marked 'skipped'. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { notificationId: string; link: string | null };
}
export type PushResult = 'ok' | 'failed' | 'unregistered';
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

type Params = Record<string, unknown>;

export function lookup(locale: string, key: string): string | undefined {
  const cat = resources[normalizeLocale(locale) as keyof typeof resources]?.translation as unknown;
  let o: unknown = cat;
  for (const p of key.split('.')) o = o && typeof o === 'object' ? (o as Params)[p] : undefined;
  return typeof o === 'string' ? o : undefined;
}

/** Same text the app shows (`app.notify.<kind>.title/body`), rendered for a push. */
export function renderNotification(
  kind: string,
  params: Params,
  locale: string,
  club = PLATFORM_NAME,
) {
  if (kind === 'announcement')
    return { title: String(params.title ?? ''), body: String(params.body ?? '') };
  const values: Params = { club, ...params };
  if (typeof params.startsAt === 'string') {
    values.time = new Intl.DateTimeFormat(INTL_LOCALE[normalizeLocale(locale)], {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Belgrade',
    }).format(new Date(params.startsAt));
  }
  // Calendar days (F13-2 pause from / to / new end date).
  const day = new Intl.DateTimeFormat(INTL_LOCALE[normalizeLocale(locale)], {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  for (const k of ['from', 'to', 'endDate']) {
    const v = params[k];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
      values[k] = day.format(new Date(`${v}T00:00:00Z`));
  }
  const fill = (s: string | undefined) =>
    (s ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(values[k] ?? ''));
  const pick = (part: 'title' | 'body') =>
    lookup(locale, `app.notify.${kind}.${part}`) ?? lookup('sr', `app.notify.${kind}.${part}`);
  return { title: fill(pick('title')), body: fill(pick('body')) };
}

/** Expo push service (works for both iOS and Android builds made with EAS). */
export function createExpoPushSender(opts: { accessToken?: string; logger: Logger }): PushSender {
  return {
    async send(messages) {
      const out: PushResult[] = [];
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        try {
          const res = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
              ...(opts.accessToken ? { authorization: `Bearer ${opts.accessToken}` } : {}),
            },
            body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default' }))),
          });
          const json = (await res.json()) as {
            data?: Array<{ status: string; details?: { error?: string } }>;
          };
          chunk.forEach((_, j) => {
            const r = json.data?.[j];
            out.push(
              r?.status === 'ok'
                ? 'ok'
                : r?.details?.error === 'DeviceNotRegistered'
                  ? 'unregistered'
                  : 'failed',
            );
          });
        } catch (err) {
          opts.logger.warn({ err }, 'push send failed');
          chunk.forEach(() => out.push('failed'));
        }
      }
      return out;
    },
  };
}

/** Sends pending pushes (max 500 per run). Returns how many notifications were pushed. */
export async function deliverPending(db: Kysely<DB>, sender: PushSender | null): Promise<number> {
  if (!sender) {
    await sql`update public.notifications set push_status = 'skipped' where push_status = 'pending'`.execute(
      db,
    );
    return 0;
  }
  // Device removed since the notification was written: nothing to push.
  await sql`update public.notifications set push_status = 'none'
              where push_status = 'pending'
                and not exists (select 1 from public.push_tokens t where t.user_id = notifications.user_id)`.execute(
    db,
  );
  const rows = await sql<{
    id: string;
    kind: string;
    params: Params;
    link: string | null;
    locale: string;
    token: string;
    club: string | null;
  }>`
    select n.id, n.kind, n.params, n.link, p.locale, t.token,
           -- F12: the name of the gym the notification is about (short name, else the gym name)
           coalesce(nullif(s.value #>> '{}', ''), c.name) as club
    from (select * from public.notifications where push_status = 'pending'
          order by created_at limit 500) n
    join public.profiles p on p.id = n.user_id
    join public.push_tokens t on t.user_id = n.user_id
    left join public.clubs c on c.id = n.club_id
    left join public.settings s on s.club_id = n.club_id and s.key = 'club.short_name'
  `
    .execute(db)
    .then((r) => r.rows);
  if (!rows.length) return 0;
  const results = await sender.send(
    rows.map((r) => ({
      to: r.token,
      ...renderNotification(r.kind, r.params, r.locale, r.club || PLATFORM_NAME),
      data: { notificationId: r.id, link: r.link },
    })),
  );
  const ok = new Set<string>();
  const dead: string[] = [];
  rows.forEach((r, i) => {
    if (results[i] === 'ok') ok.add(r.id);
    if (results[i] === 'unregistered') dead.push(r.token);
  });
  const all = [...new Set(rows.map((r) => r.id))];
  const failed = all.filter((id) => !ok.has(id));
  if (ok.size)
    await db
      .updateTable('notifications')
      .set({ push_status: 'sent' })
      .where('id', 'in', [...ok])
      .execute();
  if (failed.length)
    await db
      .updateTable('notifications')
      .set({ push_status: 'failed' })
      .where('id', 'in', failed)
      .execute();
  if (dead.length) await db.deleteFrom('push_tokens').where('token', 'in', dead).execute();
  return ok.size;
}
