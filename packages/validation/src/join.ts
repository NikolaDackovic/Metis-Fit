import { z } from 'zod';
import { uuid } from './common';

/** Self-service from the app: becoming a member and asking for (renewing) a membership. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.invalid_date' });

export const publicPlanDto = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceAmount: z.number(),
  currency: z.string(),
  durationDays: z.number().nullable(),
  visitLimit: z.number().nullable(),
});
export type PublicPlanDto = z.infer<typeof publicPlanDto>;

export const becomeMemberBody = z.object({
  phone: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().min(6, { error: 'validation.invalid_phone' }).max(20).nullable().optional(),
  ),
  dateOfBirth: isoDate.nullable().optional(),
});
export type BecomeMemberBody = z.infer<typeof becomeMemberBody>;

export const membershipRequestBody = z.object({ planId: uuid });
export const activateMembershipBody = z.object({
  payment: z
    .object({
      amount: z.number().int().min(1, { error: 'validation.amount_positive' }),
      method: z.enum(['cash', 'card', 'bank_transfer', 'other']),
    })
    .nullable()
    .optional(),
});
