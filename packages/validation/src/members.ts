import { z } from 'zod';
import { email, isoDate, pagination, personName, phone, uuid } from './common';

const optionalNullable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());

const memberFields = {
  firstName: personName,
  lastName: personName,
  email: optionalNullable(email),
  phone: optionalNullable(phone),
  dateOfBirth: optionalNullable(isoDate),
  notesPublic: optionalNullable(z.string().trim().max(500, { error: 'validation.too_long' })),
  marketingOptIn: z.boolean().optional(),
};

const contactRequired = (v: { email?: string | null; phone?: string | null }) =>
  Boolean(v.email || v.phone);
const contactIssue = { error: 'validation.contact_required', path: ['email'] };

export const createMemberBody = z
  .object(memberFields)
  .strict()
  .refine(contactRequired, contactIssue);
export type CreateMemberBody = z.infer<typeof createMemberBody>;

export const updateMemberBody = z
  .object(memberFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { error: 'validation.empty_update' });
export type UpdateMemberBody = z.infer<typeof updateMemberBody>;

export const listMembersQuery = pagination.extend({
  q: z.string().trim().max(100).optional(),
  includeDeactivated: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  sort: z.enum(['createdAt', '-createdAt', 'lastName', '-lastName']).default('-createdAt'),
  /** Filter by the member's best current membership status ('none' = no membership at all). */
  status: z.enum(['active', 'expiring_soon', 'expired', 'paused', 'pending', 'none']).optional(),
});
export type ListMembersQuery = z.infer<typeof listMembersQuery>;

export const deactivateMemberBody = z
  .object({ reason: z.string().trim().min(3, { error: 'validation.required' }).max(500) })
  .strict();

export const memberDto = z.object({
  id: uuid,
  memberNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  notesPublic: z.string().nullable(),
  marketingOptIn: z.boolean(),
  hasAppAccount: z.boolean(),
  deactivatedAt: z.string().nullable(),
  /** Personal data erased (account deletion); the row stays for bookkeeping. */
  anonymizedAt: z.string().nullable(),
  createdAt: z.string(),
  /** Gym photo, else the app profile photo (detail view only). */
  photoUrl: z.string().nullable().optional(),
});
export type MemberDto = z.infer<typeof memberDto>;

/** List row: member + summary of the best current membership (computed by the API). */
export const memberListItemDto = memberDto.extend({
  currentStatus: z.enum(['active', 'expiring_soon', 'expired', 'paused', 'pending', 'none']),
  currentPlanName: z.string().nullable(),
  currentEndDate: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
});
export type MemberListItemDto = z.infer<typeof memberListItemDto>;
