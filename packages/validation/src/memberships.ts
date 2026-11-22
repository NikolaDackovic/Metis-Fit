import { z } from 'zod';
import { isoDate, uuid } from './common';

export const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'other'] as const;
export const paymentMethod = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethod>;

export const MEMBERSHIP_DISPLAY_STATUSES = [
  'active',
  'expiring_soon',
  'expired',
  'paused',
  'pending',
  'cancelled',
] as const;
export const membershipDisplayStatus = z.enum(MEMBERSHIP_DISPLAY_STATUSES);
export type MembershipDisplayStatus = z.infer<typeof membershipDisplayStatus>;

const note = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().max(500, { error: 'validation.too_long' }).nullable().optional(),
);

export const paymentInput = z.object({
  amount: z.number().int().min(1, { error: 'validation.amount_positive' }),
  method: paymentMethod,
  note,
});

export const assignMembershipBody = z
  .object({
    planId: uuid,
    /** Omitted → today, or the day after the member's current membership of the same plan ends. */
    startDate: isoDate.optional(),
    payment: paymentInput.nullable().optional(),
    /** Promo code applied by the front desk; the membership price is stored discounted. */
    promoCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{3,30}$/, { error: 'validation.invalid_code' })
      .transform((x) => x.toUpperCase())
      .nullable()
      .optional(),
  })
  .strict();
export type AssignMembershipBody = z.infer<typeof assignMembershipBody>;

export const cancelMembershipBody = z
  .object({ reason: z.string().trim().min(3, { error: 'validation.required' }).max(500) })
  .strict();

export const membershipDto = z.object({
  id: uuid,
  memberId: uuid,
  planId: uuid,
  planName: z.string(),
  planKind: z.string(),
  state: z.string(),
  displayStatus: membershipDisplayStatus,
  startDate: z.string(),
  endDate: z.string().nullable(),
  daysLeft: z.number().nullable(),
  visitLimit: z.number().nullable(),
  visitsUsed: z.number(),
  visitsRemaining: z.number().nullable(),
  priceAmount: z.number(),
  /** Set when a promo code was used: the price before the discount and the code. */
  promoCode: z.string().nullable(),
  discountAmount: z.number(),
  paidAmount: z.number(),
  balanceAmount: z.number(),
  currency: z.string(),
  cancelledReason: z.string().nullable(),
  createdAt: z.string(),
});
export type MembershipDto = z.infer<typeof membershipDto>;
