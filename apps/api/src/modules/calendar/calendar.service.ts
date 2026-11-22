import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { CalendarFeedDto } from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { clubContext, currentClubId } from '../../shared/club-context';
import { AppError } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { lookup } from '../notifications/push';

/**
 * F14-8 calendar subscription. The link is `<club id>.<secret>`: the club id says which gym's
 * data to read (calendar apps send no headers), the secret proves it is the member's own link.
 * Only a hash of the whole token is stored.
 */
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const notFound = () => new AppError('NOT_FOUND', 'errors.calendar.not_found');

/** RFC 5545 text: escape \ ; , and new lines; fold lines longer than 75 octets. */
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

interface Event {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  status: 'CONFIRMED' | 'TENTATIVE';
}

function ics(calName: string, location: string, events: Event[]) {
  const now = stamp(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Metis Fit//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${esc(e.summary)}`,
      `LOCATION:${esc(location)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      `STATUS:${e.status}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function createCalendarService(db: Kysely<DB>) {
  const mine = (actor: Actor) =>
    withStaffTx(db, async (tx) => {
      await memberIdFor(tx, actor); // only members of this gym have a schedule here
      return tx
        .selectFrom('calendar_feeds')
        .select(['id', 'created_at'])
        .where('user_id', '=', actor.userId)
        .executeTakeFirst();
    });

  return {
    get: async (actor: Actor): Promise<CalendarFeedDto> => {
      const f = await mine(actor);
      return {
        active: Boolean(f),
        createdAt: f ? new Date(f.created_at).toISOString() : null,
        token: null,
      };
    },

    /** A new link; any earlier one stops working. */
    create: (actor: Actor, req: Request): Promise<CalendarFeedDto> =>
      withStaffTx(db, async (tx) => {
        await memberIdFor(tx, actor);
        const token = `${currentClubId()}.${randomBytes(32).toString('base64url')}`;
        await tx.deleteFrom('calendar_feeds').where('user_id', '=', actor.userId).execute();
        const row = await tx
          .insertInto('calendar_feeds')
          .values({ user_id: actor.userId, token_hash: hash(token) })
          .returning(['id', 'created_at'])
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'calendar_feed.create',
          entityType: 'calendar_feed',
          entityId: row.id,
        });
        return { active: true, createdAt: new Date(row.created_at).toISOString(), token };
      }),

    remove: (actor: Actor, req: Request) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .deleteFrom('calendar_feeds')
          .where('user_id', '=', actor.userId)
          .returning('id')
          .executeTakeFirst();
        if (r)
          await writeAudit(tx, actor, req, {
            action: 'calendar_feed.delete',
            entityType: 'calendar_feed',
            entityId: r.id,
          });
        return { ok: true };
      }),

    /** The calendar file for a link (no sign-in: the secret is the key). */
    feed: async (token: string): Promise<string> => {
      const clubId = token.slice(0, 36);
      const club = await db
        .selectFrom('clubs')
        .select(['id', 'name', 'status'])
        .where('id', '=', clubId)
        .executeTakeFirst();
      if (!club || club.status !== 'active') throw notFound();
      return clubContext.run({ clubId }, () =>
        withStaffTx(db, async (tx) => {
          const f = await tx
            .updateTable('calendar_feeds')
            .set({ last_used_at: new Date() })
            .where('token_hash', '=', hash(token))
            .returning('user_id')
            .executeTakeFirst();
          if (!f) throw notFound();
          const m = await tx
            .selectFrom('members as m')
            .innerJoin('profiles as p', 'p.id', 'm.user_id')
            .select(['m.id', 'p.locale'])
            .where('m.user_id', '=', f.user_id)
            .executeTakeFirst();
          if (!m) throw notFound();
          const locale = m.locale ?? 'sr';
          const t = (key: string) => lookup(locale, key) ?? lookup('sr', key) ?? key;

          const classes = await sql<{
            id: string;
            starts_at: Date;
            ends_at: Date;
            name: string;
            trainer: string | null;
            status: string;
          }>`
            select b.id, c.starts_at, c.ends_at, b.status,
                   coalesce(tl.name, ts.name, ty.key) as name,
                   nullif(trim(coalesce(tr.first_name, '') || ' ' || coalesce(tr.last_name, '')), '') as trainer
            from public.bookings b
            join public.classes c on c.id = b.class_id and c.status = 'scheduled'
            join public.class_types ty on ty.id = c.class_type_id
            left join public.class_type_translations tl on tl.class_type_id = ty.id and tl.locale = ${locale}
            left join public.class_type_translations ts on ts.class_type_id = ty.id and ts.locale = 'sr'
            left join public.trainers tr on tr.id = c.trainer_id
            where b.member_id = ${m.id} and b.status in ('confirmed', 'waitlisted', 'attended')
              and c.starts_at > now() - interval '30 days' and c.starts_at < now() + interval '60 days'
            order by c.starts_at`
            .execute(tx)
            .then((r) => r.rows);
          const sessions = await sql<{
            id: string;
            starts_at: Date;
            ends_at: Date;
            kind: string;
            title: string | null;
            location: string | null;
            trainer: string;
          }>`
            select a.id, a.starts_at, a.ends_at, a.kind, a.title, a.location,
                   t.first_name || ' ' || t.last_name as trainer
            from public.trainer_appointments a
            join public.trainers t on t.id = a.trainer_id
            where a.member_id = ${m.id} and a.status in ('scheduled', 'done')
              and a.starts_at > now() - interval '30 days' and a.starts_at < now() + interval '60 days'
            order by a.starts_at`
            .execute(tx)
            .then((r) => r.rows);

          const events: Event[] = [
            ...classes.map((c) => ({
              uid: `class-${c.id}@metis.fit`,
              start: new Date(c.starts_at),
              end: new Date(c.ends_at),
              summary:
                c.status === 'waitlisted' ? `${c.name} (${t('app.calendar.waitlist')})` : c.name,
              description: c.trainer,
              status: (c.status === 'waitlisted' ? 'TENTATIVE' : 'CONFIRMED') as Event['status'],
            })),
            ...sessions.map((a) => ({
              uid: `session-${a.id}@metis.fit`,
              start: new Date(a.starts_at),
              end: new Date(a.ends_at),
              summary: `${a.title || t(`app.appointments.kinds.${a.kind}`)} · ${a.trainer}`,
              description: a.location,
              status: 'CONFIRMED' as const,
            })),
          ];
          return ics(club.name, club.name, events);
        }),
      );
    },
  };
}
