import { z } from 'zod';

/** Error messages are translation keys (packages/translations: errors.validation.*), never prose. */
export const uuid = z.uuid({ error: 'validation.invalid_id' });

export const isoDate = z.iso.date({ error: 'validation.invalid_date' });

/** Interface language of a person (app and admin). */
export const locale = z.enum(['sr', 'en', 'ru', 'ar', 'es', 'de', 'fr', 'it', 'zh']);
export type Locale = z.infer<typeof locale>;
/** Languages the club writes its own content in (plans, exercises, descriptions). */
export const contentLocale = z.enum(['sr', 'en', 'ru', 'ar']);

export const personName = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(80, { error: 'validation.too_long' });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'validation.invalid_email' }));

/** E.164-ish: optional +, digits, spaces, dashes; 6-20 chars. Normalized by removing spaces/dashes. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 \-/()]{6,24}$/, { error: 'validation.invalid_phone' })
  .transform((v) => v.replace(/[ \-/()]/g, ''))
  .pipe(
    z
      .string()
      .min(6, { error: 'validation.invalid_phone' })
      .max(20, { error: 'validation.invalid_phone' }),
  );

export const idParams = z.object({ id: uuid });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof pagination>;

/** Money as integer minor units (para). 3.500,00 RSD = 350000. */
export const money = z.object({
  amount: z.number().int(),
  currency: z.string().length(3).default('RSD'),
});

export const listMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/**
 * Locale query param for club content: the content languages pass through, other interface
 * languages (es, de, fr, it, zh) get the English content, anything else Serbian.
 */
export const normalizeLocaleParam = z.preprocess((v) => {
  if (typeof v !== 'string') return 'sr';
  const l = v.toLowerCase().slice(0, 2);
  if (['sr', 'en', 'ru', 'ar'].includes(l)) return l;
  return ['es', 'de', 'fr', 'it', 'zh'].includes(l) ? 'en' : 'sr';
}, contentLocale);
