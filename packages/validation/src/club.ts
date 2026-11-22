import { z } from 'zod';
import { uuid } from './common';

/** Club profile edited in the admin (name, contact, slogan, logo, login photo, gallery). */

const LOCALE = z.enum(['sr', 'en', 'ru', 'ar']);
const optText = (max: number) =>
  z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(max, { error: 'validation.too_long' }).nullable().optional(),
  );
const optUrl = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .trim()
    .max(300)
    .regex(/^https:\/\/\S+$/, { error: 'validation.invalid_url' })
    .nullable()
    .optional(),
);

const hexColor = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'validation.invalid_color' })
    .nullable()
    .optional(),
);

export const clubProfileBody = z.object({
  name: z.string().trim().min(1, { error: 'validation.required' }).max(80),
  shortName: z.string().trim().min(1, { error: 'validation.required' }).max(24),
  tagline: z
    .partialRecord(LOCALE, z.string().trim().max(200, { error: 'validation.too_long' }))
    .default({}),
  phone: optText(40),
  email: z.preprocess(
    (v) => (v === '' ? null : v),
    z.email({ error: 'validation.invalid_email' }).nullable().optional(),
  ),
  address: optText(200),
  website: optUrl,
  instagram: optUrl,
  facebook: optUrl,
  /** Brand colors (#RRGGBB); null = the built-in GRIT colors. The background must be dark. */
  accentColor: hexColor,
  backgroundColor: hexColor,
});
export type ClubProfileBody = z.infer<typeof clubProfileBody>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.invalid_time' });
export const openingHoursBody = z.object({
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        isClosed: z.boolean(),
        opensAt: time.nullable(),
        closesAt: time.nullable(),
      }),
    )
    .length(7),
});
export type OpeningHoursBody = z.infer<typeof openingHoursBody>;

export const clubPhotoDto = z.object({
  id: z.string(),
  url: z.string(),
  captions: z.record(z.string(), z.string()),
  sortOrder: z.number(),
});
export type ClubPhotoDto = z.infer<typeof clubPhotoDto>;

export const clubAdminDto = z.object({
  profile: z.object({
    name: z.string(),
    shortName: z.string(),
    tagline: z.record(z.string(), z.string()),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    website: z.string().nullable(),
    instagram: z.string().nullable(),
    facebook: z.string().nullable(),
    accentColor: z.string().nullable(),
    backgroundColor: z.string().nullable(),
  }),
  logoUrl: z.string().nullable(),
  loginImageUrl: z.string().nullable(),
  openingHours: z.array(
    z.object({
      weekday: z.number(),
      opensAt: z.string().nullable(),
      closesAt: z.string().nullable(),
      isClosed: z.boolean(),
    }),
  ),
  photos: z.array(clubPhotoDto),
});
export type ClubAdminDto = z.infer<typeof clubAdminDto>;

export const CLUB_MEDIA_SLOTS = ['logo', 'login_image'] as const;
export const clubMediaBody = z.object({
  image: z.string().min(16).max(1_500_000, { error: 'validation.image_too_large' }),
});
export const clubPhotoBody = clubMediaBody.extend({
  captions: z
    .partialRecord(LOCALE, z.string().trim().max(80, { error: 'validation.too_long' }))
    .default({}),
});
export const updateClubPhotoBody = z.object({
  captions: z.partialRecord(LOCALE, z.string().trim().max(80, { error: 'validation.too_long' })),
  sortOrder: z.number().int().min(0).max(100_000),
});
export const clubPhotoParams = z.object({ id: uuid });
