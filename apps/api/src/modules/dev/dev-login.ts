import express from 'express';
import { SignJWT } from 'jose';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DB } from '@grit/database';
import { AppError } from '../../shared/errors';

/**
 * LOCAL DEVELOPMENT ONLY - stand-in for Supabase Auth while no Supabase project exists.
 * Not part of the route registry/OpenAPI; mounted by app.ts only when env.DEV_LOGIN is true,
 * which env validation forbids outside NODE_ENV=development.
 * Issues a token only for users that already exist in auth.users (created by `pnpm db:dev`).
 */
export function createDevLoginRouter(db: Kysely<DB>, jwtSecret: string) {
  const router = express.Router();
  const key = new TextEncoder().encode(jwtSecret);
  const body = z.object({ email: z.email() }).strict();

  router.post('/login', async (req, res, next) => {
    try {
      const { email } = body.parse(req.body);
      const user = (await db
        .selectFrom('auth.users' as never)
        .select(['id' as never])
        .where('email' as never, '=', email.toLowerCase() as never)
        .executeTakeFirst()) as { id: string } | undefined;
      if (!user) throw new AppError('UNAUTHENTICATED', 'errors.auth.invalid_token');

      const accessToken = await new SignJWT({ role: 'authenticated', aal: 'aal2', email })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(key);
      res.json({ success: true, data: { accessToken }, message: null, error: null });
    } catch (e) {
      next(e);
    }
  });
  // Sign-up stand-in: creates the local auth user (profile via the auth trigger) and signs in.
  const registerBody = z
    .object({
      email: z.email(),
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
    })
    .strict();
  router.post('/register', async (req, res, next) => {
    try {
      const b = registerBody.parse(req.body);
      const email = b.email.toLowerCase();
      const exists = await db
        .selectFrom('auth.users' as never)
        .select(['id' as never])
        .where('email' as never, '=', email as never)
        .executeTakeFirst();
      if (exists) throw new AppError('CONFLICT', 'validation.email_taken');
      const user = (await db
        .insertInto('auth.users' as never)
        .values({
          email,
          raw_user_meta_data: JSON.stringify({ first_name: b.firstName, last_name: b.lastName }),
        } as never)
        .returning(['id' as never])
        .executeTakeFirstOrThrow()) as { id: string };
      const accessToken = await new SignJWT({ role: 'authenticated', aal: 'aal1', email })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('12h')
        .sign(key);
      res.status(201).json({ success: true, data: { accessToken }, message: null, error: null });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
