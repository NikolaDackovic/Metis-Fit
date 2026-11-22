import { z } from 'zod';
import { uuid } from './common';

/** F8-2: promo codes (applied when a membership is sold) and loyalty points. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.invalid_date' });
const text = (max: number) => z.string().trim().max(max, { error: 'validation.too_long' });
const optText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), text(max).nullable().optional());

export const promoCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,30}$/, { error: 'validation.invalid_code' })
  .transform((s) => s.toUpperCase());

const promoTranslation = z.object({
  title: text(120).min(1, { error: 'validation.required' }),
  description: optText(500),
});

export const promoBody = z
  .object({
    code: promoCode,
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1, { error: 'validation.amount_positive' }),
    planIds: z.array(uuid).max(50).nullable().optional(),
    validFrom: isoDate.nullable().optional(),
    validUntil: isoDate.nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    maxUsesPerMember: z.number().int().min(1).max(100).default(1),
    isActive: z.boolean().default(true),
    isPublic: z.boolean().default(false),
    translations: z.partialRecord(z.enum(['sr', 'en', 'ru', 'ar']), promoTranslation).default({}),
  })
  .refine((b) => b.kind !== 'percent' || b.value <= 100, {
    path: ['value'],
    error: 'validation.percent_max',
  })
  .refine((b) => !b.validFrom || !b.validUntil || b.validUntil >= b.validFrom, {
    path: ['validUntil'],
    error: 'validation.date_order',
  })
  .refine((b) => !b.isPublic || Boolean(b.translations.sr?.title), {
    path: ['translations'],
    error: 'validation.public_promo_title',
  });
export type PromoBody = z.infer<typeof promoBody>;

export const promoDto = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number(),
  planIds: z.array(z.string()).nullable(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  maxUses: z.number().nullable(),
  maxUsesPerMember: z.number(),
  usesCount: z.number(),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  translations: z.record(
    z.string(),
    z.object({ title: z.string(), description: z.string().nullable().optional() }),
  ),
  totalDiscount: z.number(),
  createdAt: z.string(),
});
export type PromoDto = z.infer<typeof promoDto>;

/** Front desk preview before selling: is the code valid for this member and plan, and how much off. */
export const promoCheckBody = z.object({ code: promoCode, memberId: uuid, planId: uuid });
export const promoCheckDto = z.object({
  code: z.string(),
  originalAmount: z.number(),
  discountAmount: z.number(),
  finalAmount: z.number(),
  currency: z.string(),
});
export type PromoCheckDto = z.infer<typeof promoCheckDto>;

/** What members see in the app ("Akcije"). */
export const publicPromoDto = z.object({
  code: z.string(),
  kind: z.enum(['percent', 'fixed']),
  value: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  validUntil: z.string().nullable(),
});
export type PublicPromoDto = z.infer<typeof publicPromoDto>;

// ── Loyalty ───────────────────────────────────────────────────────────────────
export const LOYALTY_TIERS = ['bronze', 'silver', 'gold'] as const;
export type LoyaltyTier = (typeof LOYALTY_TIERS)[number];

export const loyaltyRewardBody = z.object({
  costPoints: z.number().int().min(1).max(1_000_000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  translations: z
    .partialRecord(
      z.enum(['sr', 'en', 'ru', 'ar']),
      z.object({
        name: text(80).min(1, { error: 'validation.required' }),
        description: optText(300),
      }),
    )
    .refine((t) => Boolean(t.sr?.name), { error: 'validation.required' }),
});
export type LoyaltyRewardBody = z.infer<typeof loyaltyRewardBody>;
export const loyaltyRewardDto = z.object({
  id: z.string(),
  costPoints: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  translations: z
    .record(
      z.string(),
      z.object({ name: z.string(), description: z.string().nullable().optional() }),
    )
    .optional(),
});
export type LoyaltyRewardDto = z.infer<typeof loyaltyRewardDto>;

export const loyaltyEntryDto = z.object({
  id: z.string(),
  points: z.number(),
  reason: z.enum(['visit', 'payment', 'payment_void', 'redeem', 'adjust', 'referral', 'challenge']),
  rewardName: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type LoyaltyEntryDto = z.infer<typeof loyaltyEntryDto>;

export const loyaltyDto = z.object({
  enabled: z.boolean(),
  balance: z.number(),
  /** Points earned in the last 365 days (decides the tier). */
  earnedYear: z.number(),
  tier: z.enum(LOYALTY_TIERS),
  nextTier: z.enum(LOYALTY_TIERS).nullable(),
  pointsToNextTier: z.number().nullable(),
  thresholds: z.object({ silver: z.number(), gold: z.number() }),
  rules: z.object({ pointsPerVisit: z.number(), minorPerPoint: z.number() }),
  history: z.array(loyaltyEntryDto),
  rewards: z.array(loyaltyRewardDto),
});
export type LoyaltyDto = z.infer<typeof loyaltyDto>;

export const redeemRewardBody = z.object({ rewardId: uuid });
export const adjustPointsBody = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0 && Math.abs(n) <= 100_000, { error: 'validation.invalid_amount' }),
  note: text(300).min(3, { error: 'validation.reason_min' }),
});

export const marketingConsentBody = z.object({ granted: z.boolean() });
