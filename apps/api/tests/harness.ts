import { SignJWT } from 'jose';
import type { Kysely } from 'kysely';
import { pino } from 'pino';
import request from 'supertest';
import { inject } from 'vitest';
import { createDb, createPool, type DB } from '@grit/database';
import { createTestDatabase } from '@grit/database/testing';
import { createApp } from '../src/app';
import { createTokenVerifier } from '../src/middleware/auth';
import { createAuthAdmin } from '../src/modules/staff/auth-admin';
import type { MealPlanner } from '../src/modules/nutrition/meal-planner';
import { createLocalMediaStore } from '../src/shared/media';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
const secretKey = new TextEncoder().encode(JWT_SECRET);
/** Tests never call the real AI: swap this to simulate a plan, null (no key) or a failure. */
export let fakeMealPlanner: MealPlanner = async () => null;
export const setFakeMealPlanner = (p: MealPlanner) => {
  fakeMealPlanner = p;
};
export const QR_SECRET = 'qr-test-secret-qr-test-secret-qr-test-0001';

export interface Harness {
  db: Kysely<DB>;
  http: ReturnType<typeof request>;
  /** Creates an auth user (+ optional role / linked member) and returns a signed access token. */
  user(opts?: {
    role?: string;
    member?: boolean;
    aal?: 'aal1' | 'aal2';
    email?: string;
    /** F12: the club for the role / member record (default club when omitted). */
    clubId?: string;
  }): Promise<TestUser>;
  close(): Promise<void>;
}

export interface TestUser {
  userId: string;
  memberId: string | null;
  token: string;
  auth: { Authorization: string };
}

let counter = 0;

export async function signToken(sub: string, aal: 'aal1' | 'aal2' = 'aal1', secret = secretKey) {
  return new SignJWT({ role: 'authenticated', aal })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

export async function createHarness(): Promise<Harness> {
  const testDb = await createTestDatabase(inject('pgAdminUrl'));
  const mediaDir = mkdtempSync(path.join(tmpdir(), 'grit-media-'));
  const pool = createPool(testDb.url, 5);
  const db = createDb(pool);
  const app = createApp({
    db,
    logger: pino({ level: 'silent' }),
    env: { NODE_ENV: 'test', CORS_ORIGINS: [], REQUIRE_MFA_FOR_ADMIN: true },
    verifyToken: createTokenVerifier({ jwtSecret: JWT_SECRET }),
    accessTokenSecret: QR_SECRET,
    media: createLocalMediaStore(mediaDir, 'http://localhost/media'),
    localMediaDir: mediaDir,
    mealPlanner: (req) => fakeMealPlanner(req),
    authAdmin: createAuthAdmin({ db, allowLocal: true }),
  });

  return {
    db,
    http: request(app),
    async user(opts = {}) {
      counter += 1;
      const email = opts.email ?? `user${counter}-${Date.now()}@example.com`;
      const u = await db
        .insertInto('auth.users' as never)
        .values({
          email,
          raw_user_meta_data: JSON.stringify({ first_name: 'Test', last_name: `User${counter}` }),
        } as never)
        .returning('id' as never)
        .executeTakeFirstOrThrow();
      const userId = (u as { id: string }).id;
      // F12: roles and member records live in one club (the default club unless given).
      const clubId =
        opts.clubId ??
        (
          await db
            .selectFrom('clubs')
            .select('id')
            .where('is_default', '=', true)
            .executeTakeFirstOrThrow()
        ).id;
      if (opts.role) {
        const role = await db
          .selectFrom('roles')
          .select('id')
          .where('key', '=', opts.role)
          .where('club_id', '=', clubId)
          .executeTakeFirstOrThrow();
        await db
          .insertInto('user_roles')
          .values({ user_id: userId, role_id: role.id, club_id: clubId })
          .execute();
      }
      let memberId: string | null = null;
      if (opts.member) {
        const m = await db
          .insertInto('members')
          .values({
            user_id: userId,
            first_name: 'Test',
            last_name: `Member${counter}`,
            email,
            club_id: clubId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        memberId = m.id;
      }
      const token = await signToken(userId, opts.aal ?? 'aal1');
      return { userId, memberId, token, auth: { Authorization: `Bearer ${token}` } };
    },
    async close() {
      await db.destroy();
      await testDb.drop();
    },
  };
}
