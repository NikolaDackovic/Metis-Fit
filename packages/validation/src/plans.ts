import { z } from 'zod';
import { uuid } from './common';

export const PLAN_KINDS = [
  'time_based',
  'visit_pack',
  'unlimited',
  'zone_pass',
  'class_pack',
  'personal_training',
] as const;
export const planKind = z.enum(PLAN_KINDS);
export type PlanKind = z.infer<typeof planKind>;

export const ZONE_KEYS = ['gym', 'crossfit', 'boxing', 'pool'] as const;
export const zoneKey = z.enum(ZONE_KEYS);

const planName = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(120, { error: 'validation.too_long' });
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );

export const planTranslationInput = z.object({
  name: planName,
  description: optionalText(1000),
  terms: optionalText(4000),
});

const planFields = z.object({
  kind: planKind,
  /** Price in minor units (para): 5.500 RSD = 550000. */
  priceAmount: z.number().int().min(0),
  durationDays: z.number().int().min(1).max(3650).nullable(),
  visitLimit: z.number().int().min(1).max(1000).nullable(),
  maxPauses: z.number().int().min(0).max(12).default(0),
  maxPauseDays: z.number().int().min(0).max(365).default(0),
  isAvailable: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  zones: z.array(zoneKey).max(10).default([]),
  translations: z.object({
    sr: planTranslationInput,
    en: planTranslationInput.optional(),
    ru: planTranslationInput.optional(),
  }),
});

const hasLimit = (v: { durationDays?: number | null; visitLimit?: number | null }) =>
  v.durationDays != null || v.visitLimit != null;
const limitIssue = { error: 'validation.plan_limit_required', path: ['durationDays'] };

export const createPlanBody = planFields.strict().refine(hasLimit, limitIssue);
export type CreatePlanBody = z.infer<typeof createPlanBody>;

export const updatePlanBody = planFields
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'validation.empty_update' });
export type UpdatePlanBody = z.infer<typeof updatePlanBody>;

export const planDto = z.object({
  id: uuid,
  kind: planKind,
  priceAmount: z.number(),
  currency: z.string(),
  durationDays: z.number().nullable(),
  visitLimit: z.number().nullable(),
  maxPauses: z.number(),
  maxPauseDays: z.number(),
  isAvailable: z.boolean(),
  sortOrder: z.number(),
  zones: z.array(z.string()),
  translations: z.record(
    z.string(),
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      terms: z.string().nullable(),
    }),
  ),
});
export type PlanDto = z.infer<typeof planDto>;
