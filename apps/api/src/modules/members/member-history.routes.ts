import { sql } from 'kysely';
import { z } from 'zod';
import { auditEntryDto, idParams, noteBody } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import { writeAudit } from '../../shared/audit';
import { notFound } from '../../shared/errors';
import { access, defineRoute } from '../../shared/route';

const tags = ['Members'];

async function assertMember(tx: Tx, id: string) {
  const m = await tx.selectFrom('members').select('id').where('id', '=', id).executeTakeFirst();
  if (!m) throw notFound('member');
}

const noteDto = z.object({
  id: z.string(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});
const attendanceDto = z.object({
  id: z.string(),
  source: z.string(),
  result: z.string(),
  reasonCode: z.string(),
  occurredAt: z.string(),
  performedByName: z.string().nullable(),
  overrideReason: z.string().nullable(),
});

export const memberHistoryRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/notes',
    access: access.can('members.notes'),
    summary: 'Internal staff notes about a member (never visible to the member)',
    tags,
    params: idParams,
    response: z.array(noteDto),
    handler: async ({ params, deps }) => ({
      data: await withStaffTx(deps.db, async (tx) => {
        await assertMember(tx, params.id);
        const rows = await tx
          .selectFrom('member_notes as n')
          .innerJoin('profiles as p', 'p.id', 'n.author_id')
          .select([
            'n.id',
            'n.body',
            'n.created_at',
            sql<string>`trim(p.first_name || ' ' || p.last_name)`.as('author'),
          ])
          .where('n.member_id', '=', params.id)
          .orderBy('n.created_at', 'desc')
          .execute();
        return rows.map((r) => ({
          id: r.id,
          body: r.body,
          authorName: r.author || '-',
          createdAt: new Date(r.created_at).toISOString(),
        }));
      }),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/members/:id/notes',
    access: access.can('members.notes'),
    summary: 'Add an internal note',
    tags,
    params: idParams,
    body: noteBody,
    response: z.object({ id: z.string() }),
    handler: async ({ params, body, actor, req, deps }) => ({
      status: 201,
      data: await withStaffTx(deps.db, async (tx) => {
        await assertMember(tx, params.id);
        const row = await tx
          .insertInto('member_notes')
          .values({ member_id: params.id, body: body.body, author_id: actor!.userId })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor!, req, {
          action: 'member_note.create',
          entityType: 'member',
          entityId: params.id,
          diff: null, // note text stays out of the audit log (it may contain sensitive context)
        });
        return { id: row.id };
      }),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/attendance',
    access: access.can('attendance.read'),
    summary: "A member's recent check-in attempts (granted and denied)",
    tags,
    params: idParams,
    response: z.array(attendanceDto),
    handler: async ({ params, deps }) => ({
      data: await withStaffTx(deps.db, async (tx) => {
        await assertMember(tx, params.id);
        const rows = await tx
          .selectFrom('attendance_attempts as a')
          .leftJoin('profiles as p', 'p.id', 'a.performed_by')
          .select([
            'a.id',
            'a.source',
            'a.result',
            'a.reason_code',
            'a.occurred_at',
            'a.override_reason',
            sql<string | null>`nullif(trim(p.first_name || ' ' || p.last_name), '')`.as('staff'),
          ])
          .where('a.member_id', '=', params.id)
          .orderBy('a.occurred_at', 'desc')
          .limit(100)
          .execute();
        return rows.map((r) => ({
          id: r.id,
          source: r.source,
          result: r.result,
          reasonCode: r.reason_code,
          occurredAt: new Date(r.occurred_at).toISOString(),
          performedByName: r.staff,
          overrideReason: r.override_reason,
        }));
      }),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/audit',
    access: access.can('audit.read'),
    summary: 'Audit history of a member, their memberships and payments',
    tags,
    params: idParams,
    response: z.array(auditEntryDto),
    handler: async ({ params, deps }) => ({
      data: await withStaffTx(deps.db, async (tx) => {
        await assertMember(tx, params.id);
        const rows = await sql<{
          id: number;
          action: string;
          diff: unknown;
          occurred_at: Date;
          actor: string | null;
        }>`
          select a.id, a.action, a.diff, a.occurred_at,
                 nullif(trim(p.first_name || ' ' || p.last_name), '') as actor
          from public.audit_logs a
          left join public.profiles p on p.id = a.actor_id
          where a.entity_id = ${params.id}
             or a.entity_id in (select id from public.memberships where member_id = ${params.id})
             or a.entity_id in (select id from public.payments where member_id = ${params.id})
          order by a.occurred_at desc, a.id desc
          limit 200
        `.execute(tx);
        return rows.rows.map((r) => ({
          id: Number(r.id),
          action: r.action,
          actorName: r.actor,
          diff: r.diff,
          occurredAt: new Date(r.occurred_at).toISOString(),
        }));
      }),
    }),
  }),
];
