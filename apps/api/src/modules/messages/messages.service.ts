import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { ConversationDto, MessageDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { AppError, notFound } from '../../shared/errors';
import type { MediaStore } from '../../shared/media';
import { memberIdFor } from '../classes/bookings.service';
import { notify } from '../notifications/notify';

/**
 * F14-3 member-trainer messages. Writing needs an active trainer-client link; reading the
 * history stays possible. The other side gets a notification (at most one per conversation every
 * 10 minutes, so a burst of messages does not flood their phone).
 */
type Side = 'member' | 'trainer';
const PAGE = 50;

async function trainerIdFor(tx: Tx, actor: Actor): Promise<string> {
  const t = await tx
    .selectFrom('trainers')
    .select('id')
    .where('user_id', '=', actor.userId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!t) throw new AppError('FORBIDDEN', 'errors.message.not_trainer');
  return t.id;
}

const linkActive = (tx: Tx, trainerId: string, memberId: string) =>
  tx
    .selectFrom('trainer_clients')
    .select('id')
    .where('trainer_id', '=', trainerId)
    .where('member_id', '=', memberId)
    .where('status', '=', 'active')
    .executeTakeFirst()
    .then(Boolean);

const everLinked = (tx: Tx, trainerId: string, memberId: string) =>
  tx
    .selectFrom('trainer_clients')
    .select('id')
    .where('trainer_id', '=', trainerId)
    .where('member_id', '=', memberId)
    .executeTakeFirst()
    .then(Boolean);

async function list(
  tx: Tx,
  side: Side,
  trainerId: string,
  memberId: string,
  before: string | undefined,
): Promise<MessageDto[]> {
  const rows = await tx
    .selectFrom('messages')
    .select(['id', 'sender', 'body', 'created_at', 'read_at'])
    .where('trainer_id', '=', trainerId)
    .where('member_id', '=', memberId)
    .$if(Boolean(before), (q) => q.where('created_at', '<', new Date(before!)))
    .orderBy('created_at', 'desc')
    .limit(PAGE)
    .execute();
  // Opening the conversation reads what the other side wrote.
  await tx
    .updateTable('messages')
    .set({ read_at: new Date() })
    .where('trainer_id', '=', trainerId)
    .where('member_id', '=', memberId)
    .where('sender', '!=', side)
    .where('read_at', 'is', null)
    .execute();
  return rows.reverse().map((r) => ({
    id: r.id,
    mine: r.sender === side,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
  }));
}

async function send(
  tx: Tx,
  side: Side,
  trainerId: string,
  memberId: string,
  body: string,
): Promise<MessageDto> {
  if (!(await linkActive(tx, trainerId, memberId)))
    throw new AppError('BUSINESS_RULE', 'errors.message.not_linked');
  const row = await tx
    .insertInto('messages')
    .values({ trainer_id: trainerId, member_id: memberId, sender: side, body })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow();
  // Tell the other side.
  const who = await sql<{
    member_user: string | null;
    trainer_user: string | null;
    member_name: string;
    trainer_name: string;
  }>`
    select m.user_id as member_user, t.user_id as trainer_user,
           m.first_name as member_name, t.first_name as trainer_name
    from public.members m, public.trainers t
    where m.id = ${memberId} and t.id = ${trainerId}`
    .execute(tx)
    .then((r) => r.rows[0]!);
  const to = side === 'member' ? who.trainer_user : who.member_user;
  if (to) {
    const slot = Math.floor(Date.now() / 600_000);
    await notify(tx, {
      userId: to,
      kind: 'message',
      category: 'club',
      params: {
        name: side === 'member' ? who.member_name : who.trainer_name,
        preview: body.length > 80 ? `${body.slice(0, 77)}...` : body,
      },
      link: side === 'member' ? `/coach/chat/${memberId}` : `/messages/${trainerId}`,
      dedupeKey: `msg:${trainerId}:${memberId}:${side}:${slot}`,
    });
  }
  return {
    id: row.id,
    mine: true,
    body,
    createdAt: new Date(row.created_at).toISOString(),
    readAt: null,
  };
}

export function createMessageService(db: Kysely<DB>, media: MediaStore) {
  const photo = (key: string | null) => (key ? media.url(key) : null);
  return {
    // ── Member ────────────────────────────────────────────────────────────────
    myConversations: (actor: Actor): Promise<ConversationDto[]> =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .executeTakeFirst();
        if (!m) return [];
        const rows = await sql<{
          id: string;
          name: string;
          photo_path: string | null;
          open: boolean;
          last_body: string | null;
          last_at: Date | null;
          unread: number;
        }>`
          select t.id, t.first_name || ' ' || t.last_name as name, t.photo_path,
                 bool_or(tc.status = 'active') as open,
                 (select body from public.messages x where x.trainer_id = t.id and x.member_id = ${m.id}
                  order by created_at desc limit 1) as last_body,
                 (select max(created_at) from public.messages x where x.trainer_id = t.id and x.member_id = ${m.id}) as last_at,
                 (select count(*)::int from public.messages x where x.trainer_id = t.id and x.member_id = ${m.id}
                  and x.sender = 'trainer' and x.read_at is null) as unread
          from public.trainer_clients tc join public.trainers t on t.id = tc.trainer_id
          where tc.member_id = ${m.id}
          group by t.id
          order by max(tc.started_at) desc`
          .execute(tx)
          .then((r) => r.rows);
        return rows
          .filter((r) => r.open || r.last_at)
          .map((r) => ({
            id: r.id,
            name: r.name,
            photoUrl: photo(r.photo_path),
            open: r.open,
            lastMessage: r.last_body,
            lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
            unread: r.unread,
          }));
      }),

    memberMessages: (actor: Actor, trainerId: string, before?: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        if (!(await everLinked(tx, trainerId, memberId))) throw notFound('conversation');
        return list(tx, 'member', trainerId, memberId, before);
      }),

    memberSend: (actor: Actor, trainerId: string, body: string) =>
      withStaffTx(db, async (tx) =>
        send(tx, 'member', trainerId, await memberIdFor(tx, actor), body),
      ),

    // ── Trainer ───────────────────────────────────────────────────────────────
    trainerConversations: (actor: Actor): Promise<ConversationDto[]> =>
      withStaffTx(db, async (tx) => {
        const trainerId = await trainerIdFor(tx, actor);
        const rows = await sql<{
          id: string;
          name: string;
          photo_key: string | null;
          open: boolean;
          last_body: string | null;
          last_at: Date | null;
          unread: number;
        }>`
          select m.id, m.first_name || ' ' || m.last_name as name,
                 coalesce(m.photo_path, p.avatar_path) as photo_key,
                 bool_or(tc.status = 'active') as open,
                 (select body from public.messages x where x.trainer_id = ${trainerId} and x.member_id = m.id
                  order by created_at desc limit 1) as last_body,
                 (select max(created_at) from public.messages x where x.trainer_id = ${trainerId} and x.member_id = m.id) as last_at,
                 (select count(*)::int from public.messages x where x.trainer_id = ${trainerId} and x.member_id = m.id
                  and x.sender = 'member' and x.read_at is null) as unread
          from public.trainer_clients tc
          join public.members m on m.id = tc.member_id and m.anonymized_at is null
          left join public.profiles p on p.id = m.user_id
          where tc.trainer_id = ${trainerId}
          group by m.id, p.avatar_path`
          .execute(tx)
          .then((r) => r.rows);
        // Latest conversation first, then clients without messages.
        rows.sort((a, b) => (b.last_at?.getTime() ?? 0) - (a.last_at?.getTime() ?? 0));
        return rows
          .filter((r) => r.open || r.last_at)
          .map((r) => ({
            id: r.id,
            name: r.name,
            photoUrl: photo(r.photo_key),
            open: r.open,
            lastMessage: r.last_body,
            lastAt: r.last_at ? new Date(r.last_at).toISOString() : null,
            unread: r.unread,
          }));
      }),

    trainerMessages: (actor: Actor, memberId: string, before?: string) =>
      withStaffTx(db, async (tx) => {
        const trainerId = await trainerIdFor(tx, actor);
        if (!(await everLinked(tx, trainerId, memberId))) throw notFound('conversation');
        return list(tx, 'trainer', trainerId, memberId, before);
      }),

    trainerSend: (actor: Actor, memberId: string, body: string) =>
      withStaffTx(db, async (tx) =>
        send(tx, 'trainer', await trainerIdFor(tx, actor), memberId, body),
      ),
  };
}
