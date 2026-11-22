import { z } from 'zod';
import { uuid } from './common';

/** Visits (inside now / check-out) and lockers chosen by the guest. */

export const lockerRefDto = z.object({
  id: z.string(),
  number: z.number(),
  roomKey: z.string(),
  roomName: z.string(),
});
export type LockerRefDto = z.infer<typeof lockerRefDto>;

export const myVisitNowDto = z.object({
  id: z.string(),
  startedAt: z.string(),
  /** When the visit closes automatically if nobody checks out. */
  autoCloseAt: z.string(),
  locker: lockerRefDto.nullable(),
});
export type MyVisitNowDto = z.infer<typeof myVisitNowDto>;

/** Locker map for guests: free / taken / out of service, never who holds a locker. */
export const lockerMapDto = z.array(
  z.object({
    key: z.string(),
    name: z.string(),
    lockers: z.array(
      z.object({
        id: z.string(),
        number: z.number(),
        state: z.enum(['free', 'taken', 'out_of_service', 'mine']),
      }),
    ),
  }),
);
export type LockerMapDto = z.infer<typeof lockerMapDto>;

export const pickLockerBody = z.object({ lockerId: uuid });

// ── Staff ─────────────────────────────────────────────────────────────────────
export const occupancyDto = z.object({
  inside: z.number(),
  visits: z.array(
    z.object({
      id: z.string(),
      memberId: z.string(),
      memberNumber: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      startedAt: z.string(),
      locker: lockerRefDto.nullable(),
    }),
  ),
});
export type OccupancyDto = z.infer<typeof occupancyDto>;

export const adminLockerMapDto = z.array(
  z.object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    lockers: z.array(
      z.object({
        id: z.string(),
        number: z.number(),
        status: z.enum(['available', 'out_of_service']),
        note: z.string().nullable(),
        occupant: z
          .object({
            visitId: z.string(),
            memberId: z.string(),
            name: z.string(),
            since: z.string(),
          })
          .nullable(),
      }),
    ),
  }),
);
export type AdminLockerMapDto = z.infer<typeof adminLockerMapDto>;

export const addLockersBody = z
  .object({
    roomKey: z.string().max(40),
    from: z.number().int().min(1).max(9999),
    to: z.number().int().min(1).max(9999),
  })
  .refine((v) => v.to >= v.from && v.to - v.from < 300, {
    error: 'validation.range_too_long',
    path: ['to'],
  });
export const updateLockerBody = z.object({
  status: z.enum(['available', 'out_of_service']).optional(),
  note: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().trim().max(200).nullable().optional(),
  ),
});
