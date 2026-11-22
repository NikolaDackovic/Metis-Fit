import { z } from 'zod';
import { uuid } from './common';

/** F13-7: rating a group class or a personal session the member had. */
export const RATING_KINDS = ['class', 'appointment'] as const;

export const rateBody = z.object({
  kind: z.enum(RATING_KINDS),
  id: uuid,
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500, { error: 'validation.too_long' }).optional(),
});
export type RateBody = z.infer<typeof rateBody>;

export const pendingRatingDto = z.object({
  kind: z.enum(RATING_KINDS),
  id: z.string(),
  /** Class type name, or null for a personal session (the app names it). */
  title: z.string().nullable(),
  trainerName: z.string().nullable(),
  startsAt: z.string(),
});
export type PendingRatingDto = z.infer<typeof pendingRatingDto>;

const avg = z.object({ avg: z.number(), count: z.number().int() });
export const ratingsSummaryDto = z.object({
  overall: avg,
  byTrainer: z.array(avg.extend({ trainerId: z.string(), name: z.string() })),
  byClassType: z.array(avg.extend({ classTypeId: z.string(), name: z.string() })),
  latest: z.array(
    z.object({
      id: z.string(),
      stars: z.number().int(),
      comment: z.string().nullable(),
      kind: z.enum(RATING_KINDS),
      title: z.string().nullable(),
      trainerName: z.string().nullable(),
      memberName: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type RatingsSummaryDto = z.infer<typeof ratingsSummaryDto>;
