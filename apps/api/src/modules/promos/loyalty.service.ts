import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  LoyaltyDto,
  LoyaltyEntryDto,
  LoyaltyRewardBody,
  LoyaltyRewardDto,
  LoyaltyTier,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { memberIdFor } from '../classes/bookings.service';

type Tr = Record<string, { name?: string; description?: string | null }>;
const pick = (t: Tr, locale: string) => (t[locale]?.name ? t[locale] : (t.sr ?? {}));

async function rules(tx: Tx) {
  return sql<{ enabled: boolean; per_visit: number; minor: number; silver: number; gold: number }>`
    select coalesce((select (value)::text from public.settings where key = 'loyalty.enabled'), 'true') = 'true' as enabled,
           public.setting_int('loyalty.points_per_visit', 10) as per_visit,
           public.setting_int('loyalty.minor_per_point', 10000) as minor,
           public.setting_int('loyalty.silver_points', 500) as silver,
           public.setting_int('loyalty.gold_points', 1500) as gold`
    .execute(tx)
    .then((r) => r.rows[0]!);
}

async function rewards(tx: Tx, locale: string, all = false): Promise<LoyaltyRewardDto[]> {
  let q = tx.selectFrom('loyalty_rewards').selectAll().orderBy('sort_order').orderBy('cost_points');
  if (!all) q = q.where('is_active', '=', true);
  return (await q.execute()).map((r) => {
    const t = pick(r.translations as Tr, locale);
    return {
      id: r.id,
      costPoints: r.cost_points,
      isActive: r.is_active,
      sortOrder: r.sort_order,
      name: t.name ?? '-',
      description: t.description ?? null,
      ...(all && { translations: r.translations as LoyaltyRewardDto['translations'] }),
    };
  });
}

/** Balance, tier and history of one member. */
async function summary(tx: Tx, memberId: string, locale: string): Promise<LoyaltyDto> {
  const r = await rules(tx);
  const totals = await sql<{ balance: number; earned: number }>`
    select coalesce(sum(points), 0)::int as balance,
           coalesce(sum(points) filter (where reason in ('visit', 'payment', 'payment_void', 'adjust')
                                          and created_at > now() - interval '365 days'), 0)::int as earned
    from public.loyalty_ledger where member_id = ${memberId}`
    .execute(tx)
    .then((x) => x.rows[0]!);
  const history = await tx
    .selectFrom('loyalty_ledger as l')
    .leftJoin('loyalty_rewards as w', 'w.id', 'l.reward_id')
    .select(['l.id', 'l.points', 'l.reason', 'l.note', 'l.created_at', 'w.translations'])
    .where('l.member_id', '=', memberId)
    .orderBy('l.created_at', 'desc')
    .limit(50)
    .execute();
  const earned = Math.max(0, totals.earned);
  const tier: LoyaltyTier = earned >= r.gold ? 'gold' : earned >= r.silver ? 'silver' : 'bronze';
  const nextTier: LoyaltyTier | null =
    tier === 'bronze' ? 'silver' : tier === 'silver' ? 'gold' : null;
  return {
    enabled: r.enabled,
    balance: totals.balance,
    earnedYear: earned,
    tier,
    nextTier,
    pointsToNextTier: nextTier ? (nextTier === 'silver' ? r.silver : r.gold) - earned : null,
    thresholds: { silver: r.silver, gold: r.gold },
    rules: { pointsPerVisit: r.per_visit, minorPerPoint: r.minor },
    history: history.map((h): LoyaltyEntryDto => ({
      id: h.id,
      points: h.points,
      reason: h.reason as LoyaltyEntryDto['reason'],
      rewardName: h.translations ? (pick(h.translations as Tr, locale).name ?? null) : null,
      note: h.note,
      createdAt: new Date(h.created_at).toISOString(),
    })),
    rewards: await rewards(tx, locale),
  };
}

const rewardValues = (b: LoyaltyRewardBody) => ({
  cost_points: b.costPoints,
  is_active: b.isActive,
  sort_order: b.sortOrder,
  translations: JSON.stringify(b.translations),
});

export function createLoyaltyService(db: Kysely<DB>) {
  return {
    mine: (actor: Actor, locale: string) =>
      withStaffTx(db, async (tx) => summary(tx, await memberIdFor(tx, actor), locale)),
    ofMember: (memberId: string, locale: string) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .executeTakeFirst();
        if (!m) throw notFound('member');
        return summary(tx, memberId, locale);
      }),

    /** Front desk hands out a reward: points are taken under a lock on the member row. */
    redeem: (actor: Actor, req: Request, memberId: string, rewardId: string, locale: string) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .forUpdate()
          .executeTakeFirst();
        if (!m) throw notFound('member');
        const r = await rules(tx);
        if (!r.enabled) throw new AppError('BUSINESS_RULE', 'errors.loyalty.disabled');
        const reward = await tx
          .selectFrom('loyalty_rewards')
          .select(['id', 'cost_points', 'is_active'])
          .where('id', '=', rewardId)
          .executeTakeFirst();
        if (!reward || !reward.is_active)
          throw new AppError('NOT_FOUND', 'errors.reward.not_found');
        const { balance } = await sql<{ balance: number }>`
          select coalesce(sum(points), 0)::int as balance from public.loyalty_ledger where member_id = ${memberId}`
          .execute(tx)
          .then((x) => x.rows[0]!);
        if (balance < reward.cost_points)
          throw new AppError('BUSINESS_RULE', 'errors.loyalty.insufficient');
        const row = await tx
          .insertInto('loyalty_ledger')
          .values({
            member_id: memberId,
            points: -reward.cost_points,
            reason: 'redeem',
            reward_id: reward.id,
            created_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'loyalty.redeem',
          entityType: 'loyalty_ledger',
          entityId: row.id,
          diff: { after: { memberId, rewardId, points: -reward.cost_points } },
        });
        return summary(tx, memberId, locale);
      }),
    adjust: (
      actor: Actor,
      req: Request,
      memberId: string,
      points: number,
      note: string,
      locale: string,
    ) =>
      withStaffTx(db, async (tx) => {
        const m = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', memberId)
          .forUpdate()
          .executeTakeFirst();
        if (!m) throw notFound('member');
        const row = await tx
          .insertInto('loyalty_ledger')
          .values({ member_id: memberId, points, reason: 'adjust', note, created_by: actor.userId })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'loyalty.adjust',
          entityType: 'loyalty_ledger',
          entityId: row.id,
          diff: { after: { memberId, points, note } },
        });
        return summary(tx, memberId, locale);
      }),

    // Rewards catalog ────────────────────────────────────────────────────────
    rewards: (locale: string) => withStaffTx(db, (tx) => rewards(tx, locale, true)),
    createReward: (actor: Actor, req: Request, b: LoyaltyRewardBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const row = await tx
          .insertInto('loyalty_rewards')
          .values(rewardValues(b))
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'loyalty_reward.create',
          entityType: 'loyalty_reward',
          entityId: row.id,
          diff: { after: { costPoints: b.costPoints } },
        });
        return rewards(tx, locale, true);
      }),
    updateReward: (actor: Actor, req: Request, id: string, b: LoyaltyRewardBody, locale: string) =>
      withStaffTx(db, async (tx) => {
        const res = await tx
          .updateTable('loyalty_rewards')
          .set(rewardValues(b))
          .where('id', '=', id)
          .executeTakeFirst();
        if (!Number(res.numUpdatedRows)) throw new AppError('NOT_FOUND', 'errors.reward.not_found');
        await writeAudit(tx, actor, req, {
          action: 'loyalty_reward.update',
          entityType: 'loyalty_reward',
          entityId: id,
          diff: { after: { costPoints: b.costPoints, isActive: b.isActive } },
        });
        return rewards(tx, locale, true);
      }),
  };
}
