import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { Actor } from '../middleware/auth';
import type { AppDeps } from '../app';

/**
 * Every route declares who may call it. There is no "default": a route without an explicit
 * access rule cannot be defined, and tests assert the rule matches the URL namespace.
 */
export type Access =
  | { kind: 'public' }
  | { kind: 'self' } // any signed-in user, acting on their own data only
  | { kind: 'permission'; permission: string }
  | { kind: 'platform' }; // F12-3: the platform owner only (all gyms)

export const access = {
  public: { kind: 'public' } as Access,
  self: { kind: 'self' } as Access,
  can: (permission: string): Access => ({ kind: 'permission', permission }),
  platform: { kind: 'platform' } as Access,
};

export interface HandlerContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  actor: Actor | null;
  deps: AppDeps;
  req: Request;
  res: Response;
}

export interface HandlerResult<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number };
  status?: number;
  /** A non-JSON body (e.g. a calendar file) sent as is instead of the JSON envelope. */
  raw?: { contentType: string; body: string };
}

export interface RouteDef<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  access: Access;
  summary: string;
  tags: string[];
  params?: P;
  query?: Q;
  body?: B;
  response?: z.ZodType;
  handler: (
    ctx: HandlerContext<z.output<P>, z.output<Q>, z.output<B>>,
  ) => Promise<HandlerResult<unknown>>;
}

/** Identity helper that preserves schema inference for handlers. */
export function defineRoute<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType>(
  route: RouteDef<P, Q, B>,
): RouteDef {
  return route as unknown as RouteDef;
}
