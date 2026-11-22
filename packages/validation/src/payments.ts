import { z } from 'zod';
import { isoDate, pagination, uuid } from './common';
import { paymentInput, paymentMethod } from './memberships';

export const recordPaymentBody = paymentInput
  .extend({ memberId: uuid, membershipId: uuid.nullable().optional() })
  .strict();
export type RecordPaymentBody = z.infer<typeof recordPaymentBody>;

export const voidPaymentBody = z
  .object({ reason: z.string().trim().min(3, { error: 'validation.required' }).max(500) })
  .strict();

export const refundPaymentBody = z
  .object({
    amount: z.number().int().min(1, { error: 'validation.amount_positive' }),
    reason: z.string().trim().min(3, { error: 'validation.required' }).max(500),
  })
  .strict();

export const listPaymentsQuery = pagination.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  method: paymentMethod.optional(),
  memberId: uuid.optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuery>;

export const paymentDto = z.object({
  id: uuid,
  memberId: uuid,
  memberName: z.string(),
  memberNumber: z.string(),
  membershipId: uuid.nullable(),
  planName: z.string().nullable(),
  amount: z.number(),
  currency: z.string(),
  method: paymentMethod,
  status: z.enum(['recorded', 'voided']),
  paidAt: z.string(),
  note: z.string().nullable(),
  refundOf: uuid.nullable(),
  refundedAmount: z.number(),
  voidReason: z.string().nullable(),
  recordedByName: z.string(),
});
export type PaymentDto = z.infer<typeof paymentDto>;
