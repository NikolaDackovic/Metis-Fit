import { createDb, createPool } from '@grit/database';
import { pino } from 'pino';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createTokenVerifier } from './middleware/auth';
import { createWebhookSender, deliverFiscal } from './modules/cafe/pos';
import { createAuthAdmin } from './modules/staff/auth-admin';
import { startNotificationScheduler } from './modules/notifications/jobs';
import { createExpoPushSender } from './modules/notifications/push';
import { createMealPlanner } from './modules/nutrition/meal-planner';
import {
  createLocalMediaStore,
  createSupabaseMediaStore,
  installDefaultClubMedia,
  seedDefaultClubMedia,
} from './shared/media';

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const pool = createPool(env.DATABASE_URL);
const db = createDb(pool);

// Local disk in development; Supabase Storage (public bucket) on staging/production.
const remoteMedia =
  env.MEDIA_STORE === 'supabase'
    ? createSupabaseMediaStore({
        supabaseUrl: env.SUPABASE_URL!,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
        bucket: env.MEDIA_BUCKET,
      })
    : null;
const media = remoteMedia ?? createLocalMediaStore(env.MEDIA_DIR, env.MEDIA_PUBLIC_URL);
await (
  remoteMedia ? seedDefaultClubMedia(remoteMedia) : installDefaultClubMedia(env.MEDIA_DIR)
).catch((err: unknown) => logger.warn({ err }, 'could not install default club photos'));

const posSender = createWebhookSender(env.CAFE_POS_SECRET, logger);

const app = createApp({
  authAdmin: createAuthAdmin({
    db,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    // Local accounts only for local development (the dev database emulates auth.users).
    allowLocal: env.NODE_ENV !== 'production' && !env.SUPABASE_SERVICE_ROLE_KEY,
    redirectTo: env.STAFF_INVITE_REDIRECT_URL,
  }),
  posSender,
  posSecretConfigured: Boolean(env.CAFE_POS_SECRET),
  db,
  logger,
  env,
  accessTokenSecret: env.QR_TOKEN_SECRET,
  media,
  localMediaDir: remoteMedia ? undefined : env.MEDIA_DIR,
  mealPlanner: createMealPlanner({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_NUTRITION_MODEL,
    logger,
  }),
  devLogin:
    env.DEV_LOGIN && env.SUPABASE_JWT_SECRET ? { jwtSecret: env.SUPABASE_JWT_SECRET } : undefined,
  verifyToken: createTokenVerifier({
    supabaseUrl: env.SUPABASE_URL,
    jwtSecret: env.SUPABASE_JWT_SECRET,
  }),
});

const push =
  env.PUSH_PROVIDER === 'expo'
    ? createExpoPushSender({ accessToken: env.EXPO_ACCESS_TOKEN, logger })
    : null;
const stopJobs = env.NOTIFICATION_JOBS ? startNotificationScheduler(db, push, logger) : () => {};
// Café: retry POS hand-overs that failed (the POS may have been offline).
const fiscalTimer = setInterval(() => {
  void deliverFiscal(db, posSender).catch((err: unknown) =>
    logger.warn({ err }, 'fiscal retry failed'),
  );
}, 5 * 60_000);
fiscalTimer.unref();

const server = app.listen(env.PORT, () =>
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'GRIT API listening'),
);

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  clearInterval(fiscalTimer);
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
