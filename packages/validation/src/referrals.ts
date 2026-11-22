import { z } from 'zod';

/**
 * F13-3 "Bring a friend". A member shares a personal code; a new member enters it before the
 * first payment; with that payment both get loyalty points set by the gym.
 */
export const REFERRAL_CODE = /^[A-HJKMNP-Z2-9]{6}$/;

export const claimReferralBody = z.object({
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(z.string().regex(REFERRAL_CODE, { error: 'validation.invalid_referral_code' })),
});

export const referralSettingsBody = z.object({
  enabled: z.boolean(),
  pointsReferrer: z.number().int().min(0).max(100_000),
  pointsFriend: z.number().int().min(0).max(100_000),
});
export type ReferralSettings = z.infer<typeof referralSettingsBody>;

export const myReferralDto = z.object({
  enabled: z.boolean(),
  /** Personal code (null until the person is a member of this gym). */
  code: z.string().nullable(),
  pointsReferrer: z.number().int(),
  pointsFriend: z.number().int(),
  /** Friends this member brought: first name and last initial only. */
  invited: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['pending', 'rewarded']),
      points: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  earned: z.number().int(),
  /** May still enter a friend's code (a member who has not paid yet and was not referred). */
  canClaim: z.boolean(),
  /** Who brought this member, if anyone. */
  referredBy: z.string().nullable(),
});
export type MyReferralDto = z.infer<typeof myReferralDto>;

const person = z.object({ id: z.string(), name: z.string(), memberNumber: z.string() });
export const adminReferralsDto = z.object({
  settings: referralSettingsBody,
  items: z.array(
    z.object({
      id: z.string(),
      referrer: person,
      friend: person,
      status: z.enum(['pending', 'rewarded']),
      referrerPoints: z.number().int(),
      friendPoints: z.number().int(),
      createdAt: z.string(),
      rewardedAt: z.string().nullable(),
    }),
  ),
});
export type AdminReferralsDto = z.infer<typeof adminReferralsDto>;
