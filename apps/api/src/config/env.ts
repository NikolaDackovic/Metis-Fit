import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().min(1),
    SUPABASE_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    SUPABASE_JWT_SECRET: z
      .string()
      .min(32)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    REQUIRE_MFA_FOR_ADMIN: bool.default(true),
    /**
     * LOCAL DEVELOPMENT ONLY: enables POST /v1/dev/login, which signs HS256 tokens with
     * SUPABASE_JWT_SECRET for seeded dev users, so the stack runs without a Supabase project.
     */
    DEV_LOGIN: bool.default(false),
    /** HMAC secret for QR access tokens. Rotating it invalidates all live tokens (they live 60 s). */
    QR_TOKEN_SECRET: z.string().min(32),
    /** Local folder for uploaded images (development). Production uses Supabase Storage. */
    MEDIA_DIR: z.string().default('.tmp/media'),
    /** Public base URL of uploaded images. */
    MEDIA_PUBLIC_URL: z.string().default('http://localhost:4000/media'),
    /** 'local' disk (development) or 'supabase' Storage (staging/production, public bucket). */
    MEDIA_STORE: z.enum(['local', 'supabase']).default('local'),
    MEDIA_BUCKET: z.string().default('club-media'),
    /** AI provider key for AI meal plans. Optional: without it members get targets only. */
    ANTHROPIC_API_KEY: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Model name from the AI provider (set on the server together with the key). */
    AI_NUTRITION_MODEL: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Push provider: 'none' (in-app inbox only) or 'expo' (Expo push service, EAS builds). */
    PUSH_PROVIDER: z.enum(['none', 'expo']).default('none'),
    /** Optional Expo access token (when push security is enabled in the Expo project). */
    EXPO_ACCESS_TOKEN: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Supabase service-role key: only for inviting staff (server-side secret, never in a frontend). */
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Where the invite email sends new staff to set their password (the admin URL). */
    STAFF_INVITE_REDIRECT_URL: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Café POS / fiscal webhook signing secret (HMAC-SHA256). The URL is set in the admin. */
    CAFE_POS_SECRET: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Run notification automations in this process (turn off on extra API instances or in scripts). */
    NOTIFICATION_JOBS: bool.default(true),
  })
  .refine((e) => e.SUPABASE_URL || e.SUPABASE_JWT_SECRET, {
    error: 'Set SUPABASE_URL (JWKS) or SUPABASE_JWT_SECRET so JWTs can be verified',
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.REQUIRE_MFA_FOR_ADMIN, {
    error: 'REQUIRE_MFA_FOR_ADMIN cannot be disabled in production',
  })
  .refine((e) => !e.DEV_LOGIN || (e.NODE_ENV === 'development' && e.SUPABASE_JWT_SECRET), {
    error: 'DEV_LOGIN is allowed only with NODE_ENV=development and a SUPABASE_JWT_SECRET',
  })
  .refine((e) => e.MEDIA_STORE !== 'supabase' || (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY), {
    error: 'MEDIA_STORE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  })
  .refine((e) => !isDeployed(e.NODE_ENV) || e.SUPABASE_URL, {
    error: 'staging/production must verify JWTs against SUPABASE_URL (JWKS)',
  })
  .refine(
    (e) =>
      !isDeployed(e.NODE_ENV) ||
      (e.CORS_ORIGINS.length > 0 && e.CORS_ORIGINS.every((o) => o.startsWith('https://'))),
    { error: 'staging/production need CORS_ORIGINS with https:// URLs (admin, website)' },
  )
  .refine((e) => !isDeployed(e.NODE_ENV) || e.MEDIA_STORE === 'supabase', {
    error: 'staging/production must use MEDIA_STORE=supabase (container disks are temporary)',
  });

function isDeployed(env: string) {
  return env === 'staging' || env === 'production';
}

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  ${issues.join('\n  ')}`);
  }
  return parsed.data;
}
