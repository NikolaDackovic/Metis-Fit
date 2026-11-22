import { sql } from 'kysely';
import { z } from 'zod';
import { withAnonTx } from '../../database/tx';
import { access, defineRoute } from '../../shared/route';
import { publicClubMedia } from '../club/club.service';

const clubDto = z.object({
  info: z.record(z.string(), z.unknown()),
  openingHours: z.array(
    z.object({
      weekday: z.number(),
      opensAt: z.string().nullable(),
      closesAt: z.string().nullable(),
      isClosed: z.boolean(),
    }),
  ),
  logoUrl: z.string().nullable(),
  loginImageUrl: z.string().nullable(),
  /** F12: the original gym (GRIT) keeps its built-in logo; others fall back to the platform logo. */
  isDefault: z.boolean(),
  photos: z.array(
    z.object({
      id: z.string(),
      url: z.string(),
      captions: z.record(z.string(), z.string()),
      sortOrder: z.number(),
    }),
  ),
});

export const publicRoutes = [
  defineRoute({
    method: 'get',
    path: '/public/club',
    access: access.public,
    summary: 'Public club information and opening hours',
    tags: ['Public'],
    response: clubDto,
    handler: async ({ deps, res }) => {
      // Runs as role `anon`: only rows RLS marks as public can be returned.
      const data = await withAnonTx(deps.db, async (tx) => {
        const settings = await tx.selectFrom('settings').select(['key', 'value']).execute();
        const hours = await tx.selectFrom('opening_hours').selectAll().orderBy('weekday').execute();
        const club = await tx
          .selectFrom('clubs')
          .select('is_default')
          .where('id', '=', sql<string>`public.current_club_id()`)
          .executeTakeFirst();
        return {
          info: Object.fromEntries(settings.map((s) => [s.key.replace(/^club\./, ''), s.value])),
          openingHours: hours.map((h) => ({
            weekday: h.weekday,
            opensAt: h.opens_at?.slice(0, 5) ?? null,
            closesAt: h.closes_at?.slice(0, 5) ?? null,
            isClosed: h.is_closed,
          })),
          ...(await publicClubMedia(tx, deps.media)),
          isDefault: club?.is_default ?? true,
        };
      });
      res.setHeader('cache-control', 'public, max-age=300');
      return { data };
    },
  }),
];
