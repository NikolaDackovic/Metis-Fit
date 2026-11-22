import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  CreatePtRequestBody,
  PtRequestAdminDto,
  PtRequestDto,
  PtRequestStatus,
  PtSessionsDto,
  UpdatePtRequestBody,
} from '@grit/validation';
import { withMemberTx, withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { changedFields, writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from './bookings.service';

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

function baseRequests(tx: Tx) {
  return tx
    .selectFrom('pt_requests as r')
    .leftJoin('trainers as tr', 'tr.id', 'r.trainer_id')
    .select([
      'r.id',
      'r.member_id',
      'r.trainer_id',
      'r.goal',
      'r.preferred_times',
      'r.status',
      'r.created_at',
      'r.updated_at',
      sql<string | null>`tr.first_name || ' ' || tr.last_name`.as('trainer_name'),
    ]);
}

const toDto = (r: {
  id: string;
  trainer_id: string | null;
  trainer_name: string | null;
  goal: string;
  preferred_times: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}): PtRequestDto => ({
  id: r.id,
  trainerId: r.trainer_id,
  trainerName: r.trainer_name,
  goal: r.goal,
  preferredTimes: r.preferred_times,
  status: r.status as PtRequestStatus,
  createdAt: iso(r.created_at)!,
  updatedAt: iso(r.updated_at)!,
});

async function adminRequest(tx: Tx, id: string): Promise<PtRequestAdminDto> {
  const r = await baseRequests(tx)
    .innerJoin('members as m', 'm.id', 'r.member_id')
    .leftJoin('profiles as h', 'h.id', 'r.handled_by')
    .select([
      'm.member_number',
      'm.first_name',
      'm.last_name',
      'm.phone',
      'm.email',
      'r.staff_note',
      sql<string | null>`nullif(trim(h.first_name || ' ' || h.last_name), '')`.as(
        'handled_by_name',
      ),
    ])
    .where('r.id', '=', id)
    .executeTakeFirst();
  if (!r) throw notFound('pt_request');
  return {
    ...toDto(r),
    member: {
      id: r.member_id,
      memberNumber: r.member_number,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      email: r.email,
    },
    staffNote: r.staff_note,
    handledByName: r.handled_by_name,
  };
}

async function sessions(tx: Tx, membershipId: string): Promise<PtSessionsDto> {
  const ms = await tx
    .selectFrom('memberships')
    .select(['visit_limit', 'visits_used'])
    .where('id', '=', membershipId)
    .executeTakeFirst();
  if (!ms) throw notFound('membership');
  const rows = await tx
    .selectFrom('pt_sessions as s')
    .leftJoin('trainers as tr', 'tr.id', 's.trainer_id')
    .leftJoin('profiles as p', 'p.id', 's.recorded_by')
    .select([
      's.id',
      's.membership_id',
      's.held_on',
      's.note',
      's.voided_at',
      's.void_reason',
      sql<string | null>`tr.first_name || ' ' || tr.last_name`.as('trainer_name'),
      sql<string | null>`nullif(trim(p.first_name || ' ' || p.last_name), '')`.as(
        'recorded_by_name',
      ),
    ])
    .where('s.membership_id', '=', membershipId)
    .orderBy('s.held_on', 'desc')
    .orderBy('s.created_at', 'desc')
    .execute();
  return {
    visitLimit: ms.visit_limit,
    visitsUsed: ms.visits_used,
    sessions: rows.map((r) => ({
      id: r.id,
      membershipId: r.membership_id,
      trainerName: r.trainer_name,
      heldOn: r.held_on,
      note: r.note,
      voidedAt: iso(r.voided_at),
      voidReason: r.void_reason,
      recordedByName: r.recorded_by_name,
    })),
  };
}

const rule = (key: string) => new AppError('BUSINESS_RULE', key);

export function createPtService(db: Kysely<DB>) {
  return {
    // Member ──────────────────────────────────────────────────────────────────
    mine: (actor: Actor) =>
      withMemberTx(db, actor, async (tx) =>
        (await baseRequests(tx).orderBy('r.created_at', 'desc').limit(20).execute()).map(toDto),
      ),

    request: (actor: Actor, b: CreatePtRequestBody) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        if (b.trainerId) {
          const t = await tx
            .selectFrom('trainers')
            .select(['is_public', 'archived_at', 'offers_personal_training'])
            .where('id', '=', b.trainerId)
            .executeTakeFirst();
          if (!t || !t.is_public || t.archived_at || !t.offers_personal_training)
            throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
              { path: 'trainerId', message: 'validation.invalid_id' },
            ]);
        }
        const open = await tx
          .selectFrom('pt_requests')
          .select('id')
          .where('member_id', '=', memberId)
          .where('status', 'in', ['new', 'contacted'])
          .executeTakeFirst();
        if (open) throw new AppError('CONFLICT', 'errors.pt.request_open');
        const row = await tx
          .insertInto('pt_requests')
          .values({
            member_id: memberId,
            trainer_id: b.trainerId ?? null,
            goal: b.goal,
            preferred_times: b.preferredTimes ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return toDto(await baseRequests(tx).where('r.id', '=', row.id).executeTakeFirstOrThrow());
      }),

    cancelMine: (actor: Actor, id: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const r = await tx
          .selectFrom('pt_requests')
          .select(['member_id', 'status'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!r || r.member_id !== memberId) throw notFound('pt_request');
        if (r.status !== 'new' && r.status !== 'contacted') throw rule('errors.pt.not_cancellable');
        await tx
          .updateTable('pt_requests')
          .set({ status: 'cancelled' })
          .where('id', '=', id)
          .execute();
        return toDto(await baseRequests(tx).where('r.id', '=', id).executeTakeFirstOrThrow());
      }),

    // Staff ───────────────────────────────────────────────────────────────────
    list: (f: { status?: PtRequestStatus; page: number; pageSize: number }) =>
      withStaffTx(db, async (tx) => {
        let q = tx.selectFrom('pt_requests');
        if (f.status) q = q.where('status', '=', f.status);
        const total = await q
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow();
        const ids = await q
          .select('id')
          // Open requests first, oldest first (they have waited longest).
          .orderBy(sql`status in ('new', 'contacted')`, 'desc')
          .orderBy(
            'created_at',
            f.status && !['new', 'contacted'].includes(f.status) ? 'desc' : 'asc',
          )
          .limit(f.pageSize)
          .offset((f.page - 1) * f.pageSize)
          .execute();
        return {
          items: await Promise.all(ids.map((r) => adminRequest(tx, r.id))),
          total: Number(total.n),
        };
      }),

    update: (actor: Actor, req: Request, id: string, b: UpdatePtRequestBody) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('pt_requests')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!before) throw notFound('pt_request');
        const set = {
          ...(b.status !== undefined && { status: b.status }),
          ...(b.trainerId !== undefined && { trainer_id: b.trainerId }),
          ...(b.staffNote !== undefined && { staff_note: b.staffNote }),
          handled_by: actor.userId,
        };
        await tx.updateTable('pt_requests').set(set).where('id', '=', id).execute();
        await writeAudit(tx, actor, req, {
          action: 'pt_request.update',
          entityType: 'pt_request',
          entityId: id,
          diff: changedFields(before as unknown as Record<string, unknown>, set),
        });
        return adminRequest(tx, id);
      }),

    sessions: (membershipId: string) => withStaffTx(db, (tx) => sessions(tx, membershipId)),

    /** A held PT session consumes one session of the membership (DECISIONS §4). */
    recordSession: (
      actor: Actor,
      req: Request,
      membershipId: string,
      b: { trainerId?: string | null; heldOn?: string; note?: string | null },
    ) =>
      withStaffTx(db, async (tx) => {
        const ms = await sql<{
          kind: string;
          state: string;
          start_date: string;
          end_date: string | null;
          visit_limit: number | null;
          visits_used: number;
          today: string;
        }>`
          select p.kind::text as kind, ms.state::text as state, ms.start_date::text,
                 ms.end_date::text, ms.visit_limit, ms.visits_used, public.club_today()::text as today
          from public.memberships ms join public.membership_plans p on p.id = ms.plan_id
          where ms.id = ${membershipId}
          for update of ms
        `
          .execute(tx)
          .then((r) => r.rows[0]);
        if (!ms) throw notFound('membership');
        if (ms.kind !== 'personal_training') throw rule('errors.pt.not_pt_membership');
        if (ms.state !== 'active') throw rule('errors.pt.membership_inactive');
        const heldOn = b.heldOn ?? ms.today;
        if (heldOn > ms.today) throw rule('errors.pt.future_date');
        if (heldOn < ms.start_date || (ms.end_date && heldOn > ms.end_date))
          throw rule('errors.pt.outside_period');
        if (ms.visit_limit !== null && ms.visits_used >= ms.visit_limit)
          throw rule('errors.pt.no_sessions_left');
        if (b.trainerId) {
          const t = await tx
            .selectFrom('trainers')
            .select('id')
            .where('id', '=', b.trainerId)
            .executeTakeFirst();
          if (!t) throw notFound('trainer');
        }
        const row = await tx
          .insertInto('pt_sessions')
          .values({
            membership_id: membershipId,
            trainer_id: b.trainerId ?? null,
            held_on: heldOn,
            note: b.note ?? null,
            recorded_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await tx
          .updateTable('memberships')
          .set((eb) => ({ visits_used: eb('visits_used', '+', 1) }))
          .where('id', '=', membershipId)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'pt_session.create',
          entityType: 'pt_session',
          entityId: row.id,
          diff: { after: { membershipId, heldOn, trainerId: b.trainerId ?? null } },
        });
        return sessions(tx, membershipId);
      }),

    voidSession: (actor: Actor, req: Request, id: string, reason: string) =>
      withStaffTx(db, async (tx) => {
        const s = await tx
          .selectFrom('pt_sessions')
          .select(['membership_id', 'voided_at'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!s) throw notFound('pt_session');
        if (s.voided_at) throw new AppError('CONFLICT', 'errors.pt.already_voided');
        await tx
          .updateTable('pt_sessions')
          .set({ voided_at: new Date(), voided_by: actor.userId, void_reason: reason })
          .where('id', '=', id)
          .execute();
        await tx
          .updateTable('memberships')
          .set((eb) => ({ visits_used: eb('visits_used', '-', 1) }))
          .where('id', '=', s.membership_id)
          .where('visits_used', '>', 0)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'pt_session.void',
          entityType: 'pt_session',
          entityId: id,
          diff: { after: { reason } },
        });
        return sessions(tx, s.membership_id);
      }),
  };
}
