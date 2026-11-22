import { z } from 'zod';
import { uuid } from './common';

/** F12-3: gyms on the platform - self-registration, the owner's approval, directory. */

export const CLUB_STATUSES = ['pending', 'active', 'suspended'] as const;
export const clubStatus = z.enum(CLUB_STATUSES);
export type ClubStatus = z.infer<typeof clubStatus>;

const opt = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );

export const clubSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, { error: 'validation.invalid_slug' });

export const registerClubBody = z.object({
  name: z.string().trim().min(2, { error: 'validation.required' }).max(80),
  /** Web address part (grit-beograd); made from the name when empty. */
  slug: z.preprocess((v) => (v === '' ? undefined : v), clubSlug.optional()),
  city: z.string().trim().min(2, { error: 'validation.required' }).max(80),
  address: opt(200),
  phone: opt(40),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.email({ error: 'validation.invalid_email' }).max(200).nullable().optional(),
  ),
});
export type RegisterClubBody = z.infer<typeof registerClubBody>;

/** A gym the signed-in person belongs to (as staff and/or member). */
export const myClubDto = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  status: clubStatus,
  roles: z.array(z.string()),
  isMember: z.boolean(),
});
export type MyClubDto = z.infer<typeof myClubDto>;

/** Public directory entry (active gyms only). */
export const publicClubDto = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
});
export type PublicClubDto = z.infer<typeof publicClubDto>;

/** What the platform owner sees about a gym. */
export const platformClubDto = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: clubStatus,
  isDefault: z.boolean(),
  ownerName: z.string().nullable(),
  ownerEmail: z.string().nullable(),
  members: z.number(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  suspendedReason: z.string().nullable(),
});
export type PlatformClubDto = z.infer<typeof platformClubDto>;

export const platformClubsQuery = z.object({ status: clubStatus.optional() });
export const suspendClubBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.required' }).max(300),
});
export const clubDirectoryQuery = z.object({
  q: z.string().trim().max(80).optional(),
});
