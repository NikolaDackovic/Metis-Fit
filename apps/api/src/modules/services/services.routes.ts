import { z } from 'zod';
import {
  earningsDto,
  earningsQuery,
  idParams,
  normalizeLocaleParam,
  sellServiceBody,
  serviceBody,
  serviceDto,
  serviceSaleDto,
  serviceSalesQuery,
  trainerRateBody,
  trainerRateDto,
  voidSaleBody,
} from '@grit/validation';
import { AppError } from '../../shared/errors';
import { access, defineRoute } from '../../shared/route';
import { createServicesService } from './services.service';

const TAG = ['Services'];
const localeQuery = z.object({ locale: normalizeLocaleParam });

export const servicesRoutes = [
  defineRoute({
    method: 'get',
    path: '/public/services',
    access: access.public,
    summary: 'Price list of single services (massage, InBody, day pass…)',
    tags: TAG,
    query: localeQuery,
    response: z.array(serviceDto),
    handler: async ({ query, deps }) => ({
      data: await createServicesService(deps.db).publicList(query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/services',
    access: access.can('services.sell'),
    summary: 'Service catalog (all, with translations and default trainer shares)',
    tags: TAG,
    query: localeQuery,
    response: z.array(serviceDto),
    handler: async ({ query, deps }) => ({
      data: await createServicesService(deps.db).staffList(query.locale),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/services',
    access: access.can('services.manage'),
    summary: 'Add a service',
    tags: TAG,
    query: localeQuery,
    body: serviceBody,
    response: z.array(serviceDto),
    handler: async ({ actor, req, query, body, deps }) => ({
      status: 201,
      data: await createServicesService(deps.db).save(actor!, req, query.locale, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/services/:id',
    access: access.can('services.manage'),
    summary: 'Edit a service (price and share changes are audited; past sales keep their amounts)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: serviceBody,
    response: z.array(serviceDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await createServicesService(deps.db).save(actor!, req, query.locale, body, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/trainer-rates',
    access: access.can('services.manage'),
    summary: "Trainers' own shares that override a service's default",
    tags: TAG,
    response: z.array(trainerRateDto),
    handler: async ({ deps }) => ({ data: await createServicesService(deps.db).rates() }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/trainer-rates',
    access: access.can('services.manage'),
    summary: "Set (or remove, with shareKind null) a trainer's share for a service",
    tags: TAG,
    body: trainerRateBody,
    response: z.object({ ok: z.literal(true) }),
    handler: async ({ actor, req, body, deps }) => ({
      data: await createServicesService(deps.db).setRate(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/service-sales',
    access: access.can('services.sell'),
    summary: 'Sell a service at the front desk (member or walk-in guest)',
    tags: TAG,
    body: sellServiceBody,
    response: serviceSaleDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createServicesService(deps.db).sell(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/service-sales',
    access: access.can('services.sell'),
    summary: 'Service sales in a period (club dates)',
    tags: TAG,
    query: serviceSalesQuery,
    response: z.array(serviceSaleDto),
    handler: async ({ query, deps }) => ({
      data: await createServicesService(deps.db).sales(query.from, query.to),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/members/:id/service-sales',
    access: access.can('members.read'),
    summary: "A member's service purchases",
    tags: TAG,
    params: idParams,
    response: z.array(serviceSaleDto),
    handler: async ({ params, deps }) => ({
      data: await createServicesService(deps.db).memberSales(params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/service-sales/:id/void',
    access: access.can('services.manage'),
    summary: 'Void a sale (kept for the record, excluded from totals and earnings)',
    tags: TAG,
    params: idParams,
    body: voidSaleBody,
    response: serviceSaleDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createServicesService(deps.db).void(actor!, req, params.id, body.reason),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/trainer-earnings',
    access: access.can('earnings.read'),
    summary: 'Trainer earnings for a month: PT sessions and services with frozen shares',
    tags: TAG,
    query: earningsQuery.extend({ locale: normalizeLocaleParam }),
    response: earningsDto,
    handler: async ({ query, deps }) => ({
      data: await createServicesService(deps.db).earnings(query.month, query.locale),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/my-earnings',
    access: access.can('progress.view_clients'),
    summary: 'My own earnings as a trainer (for staff accounts linked to a trainer profile)',
    tags: TAG,
    query: earningsQuery.extend({ locale: normalizeLocaleParam }),
    response: earningsDto,
    handler: async ({ actor, query, deps }) => {
      const svc = createServicesService(deps.db);
      const trainerId = await svc.trainerIdOf(actor!.userId);
      if (!trainerId) throw new AppError('NOT_FOUND', 'errors.trainer.not_linked');
      return { data: await svc.earnings(query.month, query.locale, trainerId) };
    },
  }),
];
