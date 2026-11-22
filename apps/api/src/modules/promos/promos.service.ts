import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { PromoBody, PromoCheckDto, PromoDto, PublicPromoDto } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

type PromoRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  plan_ids: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  max_uses_per_member: number;
  uses_count: number;
  is_active: boolean;
};

/** Discount for a price; never more than the price itself. */
export function discountFor(kind: string, value: number, price: number) {
  const d = kind === 'percent' ? Math.round((price * value) / 100) : value;
  return Math.max(0, Math.min(price, d));
}

/**
 * Validates a code for this member and plan. With `lock`, the code row is locked so the usage
 * limit holds when two receptions sell at the same moment.
 */
export async function quotePromo(
  tx: Tx,
  code: string,
  memberId: string,
  plan: { id: string; price_amount: number },
  lock = false,
) {
  let q = sql<PromoRow & { today: string }>`
    select id, code::text as code, kind, value, plan_ids, valid_from::text as valid_from,
           valid_until::text as valid_until, max_uses, max_uses_per_member, uses_count, is_active,
           public.club_today()::text as today
    from public.promo_codes where code = ${code}`;
  if (lock) q = sql`${q} for update`;
  const p = await q.execute(tx).then((r) => r.rows[0]);
  if (!p) throw new AppError('NOT_FOUND', 'errors.promo.not_found');
  if (!p.is_active) throw new AppError('BUSINESS_RULE', 'errors.promo.inactive');
  if (p.valid_from && p.today < p.valid_from)
    throw new AppError('BUSINESS_RULE', 'errors.promo.not_started');
  if (p.valid_until && p.today > p.valid_until)
    throw new AppError('BUSINESS_RULE', 'errors.promo.expired');
  if (p.plan_ids?.length && !p.plan_ids.includes(plan.id))
    throw new AppError('BUSINESS_RULE', 'errors.promo.plan_not_eligible');
  if (p.max_uses != null && p.uses_count >= p.max_uses)
    throw new AppError('BUSINESS_RULE', 'errors.promo.used_up');
  const mine = await tx
    .selectFrom('promo_redemptions as r')
    .innerJoin('memberships as m', 'm.id', 'r.membership_id')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('r.promo_id', '=', p.id)
    .where('r.member_id', '=', memberId)
    .where('m.state', '<>', 'cancelled')
    .executeTakeFirstOrThrow();
  if (Number(mine.n) >= p.max_uses_per_member)
    throw new AppError('BUSINESS_RULE', 'errors.promo.member_limit');
  return { promo: p, discount: discountFor(p.kind, p.value, plan.price_amount) };
}

/** Called inside the membership sale, after the membership row exists. */
export async function redeemPromo(
  tx: Tx,
  actor: Actor,
  q: Awaited<ReturnType<typeof quotePromo>>,
  memberId: string,
  membershipId: string,
  originalAmount: number,
) {
  await tx
    .insertInto('promo_redemptions')
    .values({
      promo_id: q.promo.id,
      member_id: memberId,
      membership_id: membershipId,
      code: q.promo.code,
      original_amount: originalAmount,
      discount_amount: q.discount,
      redeemed_by: actor.userId,
    })
    .execute();
  await tx
    .updateTable('promo_codes')
    .set((eb) => ({ uses_count: eb('uses_count', '+', 1) }))
    .where('id', '=', q.promo.id)
    .execute();
}

const iso = (d: Date | string) => new Date(d).toISOString();

export function createPromoService(db: Kysely<DB>) {
  const list = (tx: Tx, id?: string) => {
    let q = tx
      .selectFrom('promo_codes as p')
      .selectAll('p')
      .select(
        sql<number>`coalesce((select sum(r.discount_amount)::int from public.promo_redemptions r
                              join public.memberships m on m.id = r.membership_id
                              where r.promo_id = p.id and m.state <> 'cancelled'), 0)`.as('total'),
      )
      .orderBy('p.created_at', 'desc');
    if (id) q = q.where('p.id', '=', id);
    return q.execute().then((rows) =>
      rows.map((r): PromoDto => ({
        id: r.id,
        code: String(r.code),
        kind: r.kind as PromoDto['kind'],
        value: r.value,
        planIds: r.plan_ids,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        maxUses: r.max_uses,
        maxUsesPerMember: r.max_uses_per_member,
        usesCount: r.uses_count,
        isActive: r.is_active,
        isPublic: r.is_public,
        translations: (r.translations ?? {}) as PromoDto['translations'],
        totalDiscount: Number(r.total),
        createdAt: iso(r.created_at),
      })),
    );
  };
  const values = (b: PromoBody) => ({
    code: b.code,
    kind: b.kind,
    value: b.value,
    plan_ids: b.planIds?.length ? b.planIds : null,
    valid_from: b.validFrom ?? null,
    valid_until: b.validUntil ?? null,
    max_uses: b.maxUses ?? null,
    max_uses_per_member: b.maxUsesPerMember,
    is_active: b.isActive,
    is_public: b.isPublic,
    translations: JSON.stringify(b.translations),
  });
  const duplicate = (e: unknown) => {
    if ((e as { code?: string }).code === '23505')
      throw new AppError('CONFLICT', 'errors.promo.duplicate', [
        { path: 'code', message: 'errors.promo.duplicate' },
      ]);
    throw e;
  };

  return {
    list: () => withStaffTx(db, (tx) => list(tx)),
    create: (actor: Actor, req: Request, b: PromoBody) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('promo_codes')
          .values({ ...values(b), created_by: actor.userId })
          .returning('id')
          .executeTakeFirstOrThrow()
          .catch(duplicate);
        await writeAudit(tx, actor, req, {
          action: 'promo.create',
          entityType: 'promo_code',
          entityId: row.id,
          diff: { after: { code: b.code, kind: b.kind, value: b.value } },
        });
        return (await list(tx, row.id))[0]!;
      }),
    update: (actor: Actor, req: Request, id: string, b: PromoBody) =>
      withStaffTx(db, async (tx) => {
        const before = await tx
          .selectFrom('promo_codes')
          .select(['code', 'uses_count'])
          .where('id', '=', id)
          .executeTakeFirst();
        if (!before) throw notFound('promo');
        if (b.maxUses != null && b.maxUses < before.uses_count)
          throw new AppError('BUSINESS_RULE', 'errors.promo.max_below_uses');
        await tx
          .updateTable('promo_codes')
          .set(values(b))
          .where('id', '=', id)
          .execute()
          .catch(duplicate);
        await writeAudit(tx, actor, req, {
          action: 'promo.update',
          entityType: 'promo_code',
          entityId: id,
          diff: {
            before: { code: String(before.code) },
            after: { code: b.code, isActive: b.isActive },
          },
        });
        return (await list(tx, id))[0]!;
      }),
    check: (memberId: string, planId: string, code: string) =>
      withStaffTx(db, async (tx): Promise<PromoCheckDto> => {
        const plan = await tx
          .selectFrom('membership_plans')
          .select(['id', 'price_amount', 'currency'])
          .where('id', '=', planId)
          .executeTakeFirst();
        if (!plan) throw notFound('plan');
        const q = await quotePromo(tx, code, memberId, plan);
        return {
          code: q.promo.code,
          originalAmount: plan.price_amount,
          discountAmount: q.discount,
          finalAmount: plan.price_amount - q.discount,
          currency: plan.currency,
        };
      }),
    /** Active public promotions for the app. */
    publicList: (locale: string) =>
      withStaffTx(db, async (tx): Promise<PublicPromoDto[]> => {
        const rows = await sql<{
          code: string;
          kind: string;
          value: number;
          translations: Record<string, { title?: string; description?: string | null }>;
          valid_until: string | null;
        }>`
          select code::text as code, kind, value, translations, valid_until::text as valid_until
          from public.promo_codes
          where is_active and is_public
            and (valid_from is null or valid_from <= public.club_today())
            and (valid_until is null or valid_until >= public.club_today())
            and (max_uses is null or uses_count < max_uses)
          order by valid_until nulls last, created_at desc`
          .execute(tx)
          .then((r) => r.rows);
        return rows
          .map((r) => {
            const t = r.translations[locale] ?? r.translations.sr;
            return t?.title
              ? {
                  code: r.code,
                  kind: r.kind as PublicPromoDto['kind'],
                  value: r.value,
                  title: t.title,
                  description: t.description ?? null,
                  validUntil: r.valid_until,
                }
              : null;
          })
          .filter((x): x is PublicPromoDto => x !== null);
      }),
  };
}
