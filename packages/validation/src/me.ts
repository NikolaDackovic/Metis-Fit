import { z } from 'zod';
import { locale, personName, phone, uuid } from './common';

export const updateMeBody = z
  .object({
    firstName: personName,
    lastName: personName,
    phone: z.preprocess((v) => (v === '' ? null : v), phone.nullable()),
    locale,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'validation.empty_update' });
export type UpdateMeBody = z.infer<typeof updateMeBody>;

export const meDto = z.object({
  id: uuid,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  /** Profile photo (null = initials). */
  avatarUrl: z.string().nullable(),
  locale,
  roles: z.array(z.string()),
  /** Effective permissions - clients use them only to shape the UI; the API re-checks every call. */
  permissions: z.array(z.string()),
  /** Whether the session passed MFA (aal2). Owner/manager need it for admin routes. */
  aal: z.enum(['aal1', 'aal2']),
  /** F12-3: the platform owner (approves new gyms). */
  isPlatformAdmin: z.boolean(),
  member: z
    .object({ id: uuid, memberNumber: z.string(), firstName: z.string(), lastName: z.string() })
    .nullable(),
});
export type MeDto = z.infer<typeof meDto>;

/** 6-digit one-time code issued at reception to link an app account to a member profile. */
export const linkAccountBody = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, { error: 'validation.invalid_code' }),
  })
  .strict();
export type LinkAccountBody = z.infer<typeof linkAccountBody>;

export const linkCodeDto = z.object({ code: z.string(), expiresAt: z.string() });
export type LinkCodeDto = z.infer<typeof linkCodeDto>;

export const myPaymentDto = z.object({
  id: uuid,
  amount: z.number(),
  currency: z.string(),
  method: z.string(),
  status: z.enum(['recorded', 'voided']),
  paidAt: z.string(),
  planName: z.string().nullable(),
});
export type MyPaymentDto = z.infer<typeof myPaymentDto>;

export const myVisitDto = z.object({ id: uuid, occurredAt: z.string() });
export type MyVisitDto = z.infer<typeof myVisitDto>;

/** Account deletion must be confirmed explicitly (the app asks the person to type a word). */
export const deleteAccountBody = z.object({ confirm: z.literal(true) }).strict();
