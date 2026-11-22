import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  AssignMembershipBody,
  MembershipDisplayStatus,
  MembershipDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { quotePromo, redeemPromo } from '../promos/promos.service';
import { AppError, notFound } from '../../shared/errors';

/** Staff may backdate a membership by at most this many days (late data entry). */
const MAX_BACKDATE_DAYS = 7;

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

export async function loadMemberships(
  tx: Tx,
  where: { memberId?: string; id?: string; locale?: string },
): Promise<MembershipDto[]> {
  let q = tx
    .selectFrom('membership_overview as o')
    .innerJoin('membership_plans as p', 'p.id', 'o.plan_id')
    .leftJoin('membership_plan_translations as t', (j) =>
      j.onRef('t.plan_id', '=', 'o.plan_id').on('t.locale', '=', where.locale ?? 'sr'),
    )
    // Fallback to the Serbian name when the plan has no translation in the requested language.
    .leftJoin('membership_plan_translations as tsr', (j) =>
      j.onRef('tsr.plan_id', '=', 'o.plan_id').on('tsr.locale', '=', 'sr'),
    )
    .selectAll('o')
    .leftJoin('promo_redemptions as pr', 'pr.membership_id', 'o.id')
    .select([
      sql<string | null>`coalesce(t.name, tsr.name)`.as('plan_name'),
      'p.kind as plan_kind',
      'pr.code as promo_code',
      'pr.discount_amount',
    ])
    .orderBy('o.start_date', 'desc')
    .orderBy('o.created_at', 'desc');
  if (where.memberId) q = q.where('o.member_id', '=', where.memberId);
  if (where.id) q = q.where('o.id', '=', where.id);
  const rows = await q.execute();
  return rows.map((r) => ({
    id: r.id!,
    memberId: r.member_id!,
    planId: r.plan_id!,
    planName: r.plan_name ?? '-',
    planKind: r.plan_kind,
    state: r.state!,
    displayStatus: r.display_status as MembershipDisplayStatus,
    startDate: r.start_date!,
    endDate: r.end_date,
    daysLeft: r.days_left,
    visitLimit: r.visit_limit,
    visitsUsed: r.visits_used!,
    visitsRemaining: r.visits_remaining,
    priceAmount: r.price_amount!,
    promoCode: r.promo_code,
    discountAmount: r.discount_amount ?? 0,
    paidAmount: r.paid_amount ?? 0,
    balanceAmount: r.price_amount! - (r.paid_amount ?? 0),
    currency: r.currency!,
    cancelledReason: r.cancelled_reason,
    createdAt: iso(r.created_at)!,
  }));
}

export function createMembershipsService(db: Kysely<DB>) {
  return {
    listForMember: (memberId: string) =>
      withStaffTx(db, async (tx) => {
        const exists = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!exists) throw notFound('member');
        return loadMemberships(tx, { memberId });
      }),

    /** Assigns a plan to a member, optionally recording the payment - one transaction, fully audited. */
    async assign(
      actor: Actor,
      req: Request,
      memberId: string,
      input: AssignMembershipBody,
    ): Promise<MembershipDto> {
      return withStaffTx(db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select(['id', 'deactivated_at'])
          .where('id', '=', memberId)
          .forUpdate()
          .executeTakeFirst();
        if (!member) throw notFound('member');
        if (member.deactivated_at) throw new AppError('BUSINESS_RULE', 'errors.member.deactivated');

        const plan = await tx
          .selectFrom('membership_plans')
          .selectAll()
          .where('id', '=', input.planId)
          .executeTakeFirst();
        if (!plan) throw notFound('plan');
        if (!plan.is_available) throw new AppError('BUSINESS_RULE', 'errors.plan.unavailable');

        // Start: explicit, or today, or the day after the current same-plan membership ends (renewal).
        const { today, renewal_start } = await sql<{ today: string; renewal_start: string | null }>`
          select public.club_today()::text as today,
                 (max(end_date) + 1)::text as renewal_start
          from public.memberships
          where member_id = ${memberId} and plan_id = ${plan.id} and state <> 'cancelled'
            and end_date >= public.club_today()
        `
          .execute(tx)
          .then((r) => r.rows[0]!);
        const startDate = input.startDate ?? renewal_start ?? today;

        const earliest = new Date(Date.parse(today) - MAX_BACKDATE_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        if (startDate < earliest)
          throw new AppError('BUSINESS_RULE', 'errors.membership.start_too_early');

        const endDate = plan.duration_days
          ? new Date(Date.parse(startDate) + (plan.duration_days - 1) * 86_400_000)
              .toISOString()
              .slice(0, 10)
          : null;

        // Promo code: checked under a lock on the code row, price stored already discounted.
        const promo = input.promoCode
          ? await quotePromo(tx, input.promoCode, memberId, plan, true)
          : null;
        const price = plan.price_amount - (promo?.discount ?? 0);

        let membershipId: string;
        try {
          const row = await tx
            .insertInto('memberships')
            .values({
              member_id: memberId,
              plan_id: plan.id,
              state: 'active',
              start_date: startDate,
              end_date: endDate,
              visit_limit: plan.visit_limit,
              price_amount: price,
              currency: plan.currency,
              sold_by: actor.userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          membershipId = row.id;
        } catch (e) {
          if ((e as { code?: string }).code === '23P01') {
            throw new AppError('CONFLICT', 'errors.membership.overlap', [
              { path: 'startDate', message: 'errors.membership.overlap' },
            ]);
          }
          throw e;
        }

        if (promo) await redeemPromo(tx, actor, promo, memberId, membershipId, plan.price_amount);

        await writeAudit(tx, actor, req, {
          action: 'membership.create',
          entityType: 'membership',
          entityId: membershipId,
          diff: {
            after: {
              memberId,
              planId: plan.id,
              startDate,
              endDate,
              priceAmount: price,
              ...(promo && { promoCode: promo.promo.code, discountAmount: promo.discount }),
            },
          },
        });

        if (input.payment) {
          const payment = await tx
            .insertInto('payments')
            .values({
              member_id: memberId,
              membership_id: membershipId,
              amount: input.payment.amount,
              currency: plan.currency,
              method: input.payment.method,
              note: input.payment.note ?? null,
              recorded_by: actor.userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await writeAudit(tx, actor, req, {
            action: 'payment.create',
            entityType: 'payment',
            entityId: payment.id,
            diff: {
              after: {
                memberId,
                membershipId,
                amount: input.payment.amount,
                method: input.payment.method,
              },
            },
          });
        }

        const [dto] = await loadMemberships(tx, { id: membershipId });
        return dto!;
      });
    },

    async cancel(actor: Actor, req: Request, id: string, reason: string): Promise<MembershipDto> {
      return withStaffTx(db, async (tx) => {
        const row = await tx
          .selectFrom('memberships')
          .select(['id', 'state'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!row) throw notFound('membership');
        if (row.state === 'cancelled')
          throw new AppError('BUSINESS_RULE', 'errors.membership.already_cancelled');
        await tx
          .updateTable('memberships')
          .set({ state: 'cancelled', cancelled_reason: reason })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'membership.cancel',
          entityType: 'membership',
          entityId: id,
          diff: { before: { state: row.state }, after: { state: 'cancelled', reason } },
        });
        const [dto] = await loadMemberships(tx, { id });
        return dto!;
      });
    },
  };
}
