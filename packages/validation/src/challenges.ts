import { z } from 'zod';

/** F13-4 challenges: count visits / classes / workouts in this week or month, earn points. */
export const CHALLENGE_KINDS = ['visits', 'classes', 'workouts'] as const;
export const CHALLENGE_PERIODS = ['week', 'month'] as const;

export const challengeBody = z.object({
  kind: z.enum(CHALLENGE_KINDS),
  period: z.enum(CHALLENGE_PERIODS),
  target: z.number().int().min(1).max(100),
  rewardPoints: z.number().int().min(0).max(100_000),
  title: z.string().trim().min(2).max(80).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type ChallengeBody = z.infer<typeof challengeBody>;

export const challengeDto = z.object({
  id: z.string(),
  kind: z.enum(CHALLENGE_KINDS),
  period: z.enum(CHALLENGE_PERIODS),
  target: z.number().int(),
  rewardPoints: z.number().int(),
  title: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type ChallengeDto = z.infer<typeof challengeDto>;

export const myChallengeDto = challengeDto.extend({
  progress: z.number().int(),
  completed: z.boolean(),
  /** Last day of the current period (Europe/Belgrade). */
  periodEnd: z.string(),
});
export type MyChallengeDto = z.infer<typeof myChallengeDto>;
