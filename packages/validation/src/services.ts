import { z } from 'zod';
import { uuid } from './common';

/** F9b: single services, their sales and trainer earnings. */

const LOCALE = z.enum(['sr', 'en', 'ru', 'ar']);
export const SHARE_KINDS = ['percent', 'fixed'] as const;
export const SERVICE_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;

export const serviceBody = z
  .object({
    translations: z
      .partialRecord(
        LOCALE,
        z.object({
          name: z.string().trim().min(1, { error: 'validation.required' }).max(80),
          description: z.string().trim().max(300).nullable().optional(),
        }),
      )
      .refine((t) => Boolean(t.sr?.name), { error: 'validation.required' }),
    priceAmount: z.number().int().min(0).max(100_000_000),
    durationMin: z.number().int().min(1).max(600).nullable().optional(),
    needsProvider: z.boolean().default(false),
    defaultShareKind: z.enum(SHARE_KINDS).default('percent'),
    defaultShareValue: z.number().int().min(0).max(100_000_000).default(0),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(100_000).default(0),
  })
  .refine((b) => b.defaultShareKind !== 'percent' || b.defaultShareValue <= 100, {
    path: ['defaultShareValue'],
    error: 'validation.percent_max',
  });
export type ServiceBody = z.infer<typeof serviceBody>;

export const serviceDto = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  priceAmount: z.number(),
  currency: z.string(),
  durationMin: z.number().nullable(),
  needsProvider: z.boolean(),
  defaultShareKind: z.enum(SHARE_KINDS),
  defaultShareValue: z.number(),
  isSellable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  translations: z
    .record(
      z.string(),
      z.object({ name: z.string(), description: z.string().nullable().optional() }),
    )
    .optional(),
});
export type ServiceDto = z.infer<typeof serviceDto>;

export const trainerRateBody = z
  .object({
    trainerId: uuid,
    serviceId: uuid,
    /** null removes the override (the service default applies). */
    shareKind: z.enum(SHARE_KINDS).nullable(),
    shareValue: z.number().int().min(0).max(100_000_000).default(0),
  })
  .refine((b) => b.shareKind !== 'percent' || b.shareValue <= 100, {
    path: ['shareValue'],
    error: 'validation.percent_max',
  });
export const trainerRateDto = z.object({
  trainerId: z.string(),
  serviceId: z.string(),
  shareKind: z.enum(SHARE_KINDS),
  shareValue: z.number(),
});
export type TrainerRateDto = z.infer<typeof trainerRateDto>;

export const sellServiceBody = z.object({
  serviceId: uuid,
  memberId: uuid.nullable().optional(),
  trainerId: uuid.nullable().optional(),
  qty: z.number().int().min(1).max(100).default(1),
  paymentMethod: z.enum(SERVICE_PAYMENT_METHODS),
  note: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(300, { error: 'validation.too_long' }).nullable().optional(),
  ),
});
export type SellServiceBody = z.infer<typeof sellServiceBody>;

export const serviceSaleDto = z.object({
  id: z.string(),
  serviceId: z.string(),
  name: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
  totalAmount: z.number(),
  currency: z.string(),
  memberId: z.string().nullable(),
  memberName: z.string().nullable(),
  trainerId: z.string().nullable(),
  trainerName: z.string().nullable(),
  trainerShareAmount: z.number(),
  paymentMethod: z.enum(SERVICE_PAYMENT_METHODS),
  note: z.string().nullable(),
  soldAt: z.string(),
  soldByName: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
});
export type ServiceSaleDto = z.infer<typeof serviceSaleDto>;
export const serviceSalesQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const voidSaleBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.reason_min' }).max(300),
});

export const earningsQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'validation.invalid_date' }),
});
export const trainerEarningsDto = z.object({
  trainerId: z.string(),
  trainerName: z.string(),
  ptSessions: z.number(),
  ptShare: z.number(),
  services: z.array(
    z.object({
      serviceId: z.string(),
      name: z.string(),
      count: z.number(),
      revenue: z.number(),
      share: z.number(),
    }),
  ),
  servicesShare: z.number(),
  total: z.number(),
});
export type TrainerEarningsDto = z.infer<typeof trainerEarningsDto>;
export const earningsDto = z.object({
  month: z.string(),
  currency: z.string(),
  trainers: z.array(trainerEarningsDto),
  total: z.number(),
});
export type EarningsDto = z.infer<typeof earningsDto>;
