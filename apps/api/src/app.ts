import { sql } from 'kysely';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { DB } from '@grit/database';
import type { ApiSuccess } from '@grit/validation';
import type { Env } from './config/env';
import {
  bearerToken,
  MFA_REQUIRED_ROLES,
  resolveActor,
  type Actor,
  type TokenVerifier,
} from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { allRoutes } from './modules';
import { createDevLoginRouter } from './modules/dev/dev-login';
import { buildOpenApi } from './openapi';
import { clubContext, resolveClub } from './shared/club-context';
import { AppError } from './shared/errors';
import type { MealPlanner } from './modules/nutrition/meal-planner';
import type { PosSender } from './modules/cafe/pos';
import type { AuthAdmin } from './modules/staff/auth-admin';
import type { MediaStore } from './shared/media';
import type { RouteDef } from './shared/route';

export interface AppDeps {
  db: Kysely<DB>;
  verifyToken: TokenVerifier;
  logger: Logger;
  env: Pick<Env, 'NODE_ENV' | 'CORS_ORIGINS' | 'REQUIRE_MFA_FOR_ADMIN'>;
  /** Local development only (see modules/dev/dev-login.ts). Never set in staging/production. */
  devLogin?: { jwtSecret: string };
  /** HMAC secret for QR access tokens (docs/SECURITY.md §5). */
  accessTokenSecret: string;
  /** Uploaded images (trainer photos). */
  media: MediaStore;
  /** AI meal plans (null planner when no API key is configured). */
  mealPlanner: MealPlanner;
  /** Café: hands paid orders to the POS / fiscal system (null = not configured). */
  posSender?: PosSender | null;
  /** Whether CAFE_POS_SECRET is set (shown in the admin, never the value). */
  posSecretConfigured?: boolean;
  /** Creates staff accounts (Supabase invite in production, local users in dev/tests). */
  authAdmin?: AuthAdmin;
  /** Images kept in the database (MEDIA_STORE=db), served at /media/<folder>/<file>. */
  mediaReader?: { get(key: string): Promise<{ type: string; data: Buffer } | null> };
  /** Local media folder served at /media (development and tests only). */
  localMediaDir?: string;
}

export const API_PREFIX = '/v1';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

/** Routes that still work for a gym waiting for approval (its owner signs in and sets it up). */
const PENDING_OPEN = new Set(['/me', '/me/clubs', '/public/club']);

function authorize(route: RouteDef, actor: Actor | null, deps: AppDeps): void {
  if (route.access.kind === 'public') return;
  if (!actor) throw new AppError('UNAUTHENTICATED', 'errors.auth.required');
  if (route.access.kind === 'self') return;
  if (route.access.kind === 'platform') {
    if (!actor.isPlatformAdmin) throw new AppError('FORBIDDEN', 'errors.auth.forbidden');
    return;
  }
  if (!actor.permissions.has(route.access.permission)) {
    throw new AppError('FORBIDDEN', 'errors.auth.forbidden');
  }
  if (
    deps.env.REQUIRE_MFA_FOR_ADMIN &&
    actor.aal !== 'aal2' &&
    actor.roles.some((r) => MFA_REQUIRED_ROLES.includes(r))
  ) {
    throw new AppError('MFA_REQUIRED', 'errors.auth.mfa_required');
  }
}

function mount(router: express.Router, route: RouteDef, deps: AppDeps): void {
  router[route.method](
    route.path,
    wrap(async (req, res) => {
      // F12: every request works in one club (X-Club header, otherwise the default club).
      const club = await resolveClub(deps.db, req.get('x-club'));
      const clubId = club.id;
      // A gym waiting for approval is open to its own staff only (they set it up meanwhile).
      if (
        club.status === 'pending' &&
        route.access.kind !== 'permission' &&
        !PENDING_OPEN.has(route.path)
      )
        throw new AppError('NOT_FOUND', 'errors.club.not_found');
      await clubContext.run({ clubId }, async () => {
        const token = bearerToken(req.get('authorization'));
        // Public routes ignore credentials entirely; protected routes require a valid token.
        const actor =
          route.access.kind !== 'public' && token
            ? await resolveActor(deps.db, deps.verifyToken, token, clubId)
            : null;
        authorize(route, actor, deps);

        const params = route.params ? route.params.parse(req.params) : {};
        const query = route.query ? route.query.parse(req.query) : {};
        const body = route.body ? route.body.parse(req.body ?? {}) : undefined;

        const result = await route.handler({ params, query, body, actor, deps, req, res });
        if (result.raw) {
          res
            .status(result.status ?? 200)
            .type(result.raw.contentType)
            .send(result.raw.body);
          return;
        }
        const payload: ApiSuccess<unknown> = {
          success: true,
          data: result.data,
          message: null,
          error: null,
        };
        if (result.meta) payload.meta = result.meta;
        res.status(result.status ?? 200).json(payload);
      });
    }),
  );
}

export function createApp(deps: AppDeps, routes: RouteDef[] = allRoutes): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render/Cloudflare terminate TLS in front of the API
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    }),
  );
  // Local uploads are images only; other origins (admin, app) must be able to display them.
  if (deps.localMediaDir) {
    app.use(
      '/media',
      (_req, res, next) => {
        res.setHeader('cross-origin-resource-policy', 'cross-origin');
        res.setHeader('x-content-type-options', 'nosniff');
        next();
      },
      express.static(deps.localMediaDir, { fallthrough: false, maxAge: '7d', index: false }),
    );
  }
  if (deps.mediaReader) {
    const reader = deps.mediaReader;
    app.get('/media/:folder/:file', (req, res, next) => {
      reader
        .get(`${req.params.folder}/${req.params.file}`)
        .then((img) => {
          res.setHeader('cross-origin-resource-policy', 'cross-origin');
          res.setHeader('x-content-type-options', 'nosniff');
          if (!img) return void res.status(404).end();
          // Uploaded keys are random and never reused; the built-in defaults may change.
          res.setHeader(
            'cache-control',
            req.params.folder === 'defaults'
              ? 'public, max-age=86400'
              : 'public, max-age=31536000, immutable',
          );
          res.type(img.type).send(img.data);
        })
        .catch(next);
    });
  }
  app.use(helmet());
  app.use(
    cors({
      origin: deps.env.CORS_ORIGINS.length ? deps.env.CORS_ORIGINS : false,
      allowedHeaders: [
        'authorization',
        'content-type',
        'idempotency-key',
        'accept-language',
        'x-club',
        'x-request-id',
      ],
      exposedHeaders: ['x-request-id', 'retry-after'],
      maxAge: 600,
    }),
  );
  // Photo uploads carry a resized image (≤ 1 MB) as base64; everything else stays small.
  app.use(`${API_PREFIX}/admin/trainers/:id/photo`, express.json({ limit: '1600kb' }));
  app.use(`${API_PREFIX}/me/avatar`, express.json({ limit: '1600kb' }));
  // F18-1: a progress photo (up to 1 MB) plus its thumbnail, as base64.
  app.use(`${API_PREFIX}/me/progress-photos`, express.json({ limit: '2mb' }));
  app.use(`${API_PREFIX}/admin/club/media`, express.json({ limit: '1600kb' }));
  app.use(`${API_PREFIX}/admin/cafe/media`, express.json({ limit: '1600kb' }));
  app.use(`${API_PREFIX}/admin/map/background`, express.json({ limit: '1600kb' }));
  app.use(express.json({ limit: '100kb' }));

  // Baseline limiter (docs/SECURITY.md §6). Sensitive routes add stricter limiters in their modules.
  app.use(
    API_PREFIX,
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => deps.env.NODE_ENV === 'test',
      handler: (_req, _res, next) => next(new AppError('RATE_LIMITED', 'errors.rate_limited')),
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  // Readiness for the load balancer: the process is up AND the database answers.
  app.get('/ready', (_req, res) => {
    sql`select 1`
      .execute(deps.db)
      .then(() => res.json({ status: 'ready' }))
      .catch((err: unknown) => {
        deps.logger.error({ err }, 'readiness: database unreachable');
        res.status(503).json({ status: 'db_unavailable' });
      });
  });

  const router = express.Router();
  for (const route of routes) mount(router, route, deps);
  if (deps.env.NODE_ENV !== 'production') {
    const doc = buildOpenApi(routes, API_PREFIX);
    router.get('/openapi.json', (_req, res) => {
      res.json(doc);
    });
  }
  if (deps.devLogin && deps.env.NODE_ENV === 'development') {
    app.use(`${API_PREFIX}/dev`, createDevLoginRouter(deps.db, deps.devLogin.jwtSecret));
    deps.logger.warn('DEV LOGIN ENABLED - local development only');
  }
  app.use(API_PREFIX, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
