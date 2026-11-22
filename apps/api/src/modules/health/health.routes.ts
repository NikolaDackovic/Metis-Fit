import { sql } from 'kysely';
import { z } from 'zod';
import { AppError } from '../../shared/errors';
import { access, defineRoute } from '../../shared/route';

export const healthRoutes = [
  defineRoute({
    method: 'get',
    path: '/ready',
    access: access.public,
    summary: 'Readiness: API can reach the database',
    tags: ['System'],
    response: z.object({ database: z.literal('ok') }),
    handler: async ({ deps }) => {
      try {
        await sql`select 1`.execute(deps.db);
      } catch {
        throw new AppError('INTERNAL', 'errors.database_unavailable');
      }
      return { data: { database: 'ok' as const } };
    },
  }),
];
