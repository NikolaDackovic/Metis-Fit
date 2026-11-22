import { z } from 'zod';
import {
  normalizeLocaleParam,
  pendingRatingDto,
  rateBody,
  ratingsSummaryDto,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createRatingService } from './ratings.service';

const TAG = ['Ratings'];
const localeQuery = z.object({ locale: normalizeLocaleParam });
const svc = (deps: { db: Parameters<typeof createRatingService>[0] }) =>
  createRatingService(deps.db);

export const ratingRoutes = [
  defineRoute({
    method: 'get',
    path: '/me/ratings/pending',
    access: access.self,
    summary: 'Classes and personal sessions I had recently and can still rate',
    tags: TAG,
    query: localeQuery,
    response: z.array(pendingRatingDto),
    handler: async ({ actor, query, deps }) => ({
      data: await svc(deps).pending(actor!, query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/me/ratings',
    access: access.self,
    summary: 'Rate a class or a personal session (1-5 stars, optional comment)',
    tags: TAG,
    body: rateBody,
    response: z.object({ id: z.string() }),
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await svc(deps).rate(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/ratings',
    access: access.can('reports.read'),
    summary: 'Ratings: averages per trainer and class type, latest comments',
    tags: TAG,
    query: localeQuery,
    response: ratingsSummaryDto,
    handler: async ({ query, deps }) => ({ data: await svc(deps).summary(query.locale) }),
  }),
];
