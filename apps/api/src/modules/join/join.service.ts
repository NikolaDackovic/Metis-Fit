import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { BecomeMemberBody, MembershipDto, PublicPlanDto } from '@grit/validation';
import { withStaffTx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';
import { loadMemberships } from '../memberships/memberships.service';

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Self-service: a person who signed up in the app becomes a member, and a member asks for a
 * membership (new or renewal). The request is a membership in state 'pending' that gives no
 * entry; the front desk activates it when it is paid (in person: there are no online payments).
 */
export function createJoinService(db: Kysely<DB>) {
  return {
    plans: (locale: string) =>
      withStaffTx(db, async (tx): Promise<PublicPlanDto[]> => {
        const rows = await tx
          .selectFrom('membership_plans as p')
          .leftJoin('membership_plan_translations as t', (j) =>
            j.onRef('t.plan_id', '=', 'p.id').on('t.locale', '=', locale),
          )
          .leftJoin('membership_plan_translations as e', (j) =>
            j.onRef('e.plan_id', '=', 'p.id').on('e.locale', '=', 'en'),
          )
          .leftJoin('membership_plan_translations as s', (j) =>
            j.onRef('s.plan_id', '=', 'p.id').on('s.locale', '=', 'sr'),
          )
          .select([
            'p.id',
            'p.kind',
            'p.price_amount',
            'p.currency',
            'p.duration_days',
            'p.visit_limit',
            sql<string>`coalesce(t.name, ${locale === 'ar' ? sql`e.name` : sql`null`}, s.name, '-')`.as(
              'name',
            ),
            sql<
              string | null
            >`coalesce(t.description, ${locale === 'ar' ? sql`e.description` : sql`null`}, s.description)`.as(
              'description',
            ),
          ])
          .where('p.is_available', '=', true)
          .orderBy('p.sort_order')
          .orderBy('p.price_amount')
          .execute();
        return rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          description: r.description,
          priceAmount: r.price_amount,
          currency: r.currency,
          durationDays: r.duration_days,
          visitLimit: r.visit_limit,
        }));
      }),

    becomeMember: (actor: Actor, b: BecomeMemberBody) =>
      withStaffTx(db, async (tx) => {
        const existing = await tx
          .selectFrom('members')
          .select('id')
          .where('user_id', '=', actor.userId)
          .executeTakeFirst();
        if (existing) throw new AppError('CONFLICT', 'errors.member.account_already_linked');
        const who = await sql<{
          email: string | null;
          first_name: string;
          last_name: string;
          phone: string | null;
        }>`
          select public.account_email(p.id) as email, p.first_name, p.last_name, p.phone
          from public.profiles p where p.id = ${actor.userId}`
          .execute(tx)
          .then((r) => r.rows[0]);
        if (!who) throw notFound('profile');
        if (!who.first_name.trim() || !who.last_name.trim())
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'firstName', message: 'validation.required' },
          ]);
        const phone = b.phone ?? who.phone ?? null;
        if (!who.email && !phone)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'phone', message: 'validation.contact_required' },
          ]);
        // Someone already registered at the front desk with this email: link with a code instead.
        if (who.email) {
          const taken = await tx
            .selectFrom('members')
            .select('id')
            .where(sql<boolean>`lower(email::text) = ${who.email.toLowerCase()}`)
            .where('deactivated_at', 'is', null)
            .executeTakeFirst();
          if (taken) throw new AppError('CONFLICT', 'errors.member.use_link_code');
        }
        await tx
          .insertInto('members')
          .values({
            user_id: actor.userId,
            first_name: who.first_name,
            last_name: who.last_name,
            email: who.email,
            phone,
            date_of_birth: b.dateOfBirth ?? null,
            created_by: actor.userId,
          })
          .execute();
        if (b.phone)
          await tx
            .updateTable('profiles')
            .set({ phone: b.phone })
            .where('id', '=', actor.userId)
            .execute();
        return { ok: true as const };
      }),

    request: (actor: Actor, planId: string) =>
      withStaffTx(db, async (tx): Promise<MembershipDto> => {
        const memberId = await memberIdFor(tx, actor);
        const plan = await tx
          .selectFrom('membership_plans')
          .selectAll()
          .where('id', '=', planId)
          .where('is_available', '=', true)
          .executeTakeFirst();
        if (!plan) throw new AppError('BUSINESS_RULE', 'errors.plan.unavailable');
        const open = await tx
          .selectFrom('memberships')
          .select('id')
          .where('member_id', '=', memberId)
          .where('state', '=', 'pending')
          .executeTakeFirst();
        if (open) throw new AppError('CONFLICT', 'errors.membership.request_open');
        const { today, renewal } = await sql<{ today: string; renewal: string | null }>`
          select public.club_today()::text as today,
                 (select (max(end_date) + 1)::text from public.memberships
                  where member_id = ${memberId} and plan_id = ${planId} and state <> 'cancelled'
                    and end_date >= public.club_today()) as renewal`
          .execute(tx)
          .then((r) => r.rows[0]!);
        const start = renewal ?? today;
        const row = await tx
          .insertInto('memberships')
          .values({
            member_id: memberId,
            plan_id: plan.id,
            state: 'pending',
            start_date: start,
            end_date: plan.duration_days ? addDays(start, plan.duration_days - 1) : null,
            visit_limit: plan.visit_limit,
            price_amount: plan.price_amount,
            currency: plan.currency,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        return (await loadMemberships(tx, { id: row.id }))[0]!;
      }),
    withdraw: (actor: Actor, id: string) =>
      withStaffTx(db, async (tx) => {
        const memberId = await memberIdFor(tx, actor);
        const r = await tx
          .updateTable('memberships')
          .set({ state: 'cancelled', cancelled_reason: 'withdrawn by member' })
          .where('id', '=', id)
          .where('member_id', '=', memberId)
          .where('state', '=', 'pending')
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw notFound('membership');
        return { ok: true as const };
      }),

    /** Front desk: the request is paid (or approved) - it becomes an active membership. */
    activate: (
      actor: Actor,
      req: Request,
      id: string,
      payment?: { amount: number; method: string } | null,
    ) =>
      withStaffTx(db, async (tx): Promise<MembershipDto> => {
        const ms = await tx
          .selectFrom('memberships')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!ms) throw notFound('membership');
        if (ms.state !== 'pending') throw new AppError('CONFLICT', 'errors.membership.not_pending');
        const { today } = await sql<{ today: string }>`select public.club_today()::text as today`
          .execute(tx)
          .then((r) => r.rows[0]!);
        // A request that waited past its start date starts today, keeping its length.
        let start = String(ms.start_date);
        let end = ms.end_date ? String(ms.end_date) : null;
        if (start < today) {
          const len = end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 : 0;
          start = today;
          end = end ? addDays(today, len) : null;
        }
        await tx
          .updateTable('memberships')
          .set({ state: 'active', start_date: start, end_date: end, sold_by: actor.userId })
          .where('id', '=', id)
          .execute();
        if (payment) {
          await tx
            .insertInto('payments')
            .values({
              member_id: ms.member_id,
              membership_id: id,
              amount: payment.amount,
              currency: ms.currency,
              method: payment.method as never,
              recorded_by: actor.userId,
            })
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'membership.activate',
          entityType: 'membership',
          entityId: id,
          diff: { after: { startDate: start, endDate: end, payment: payment?.amount ?? null } },
        });
        return (await loadMemberships(tx, { id }))[0]!;
      }),
  };
}
