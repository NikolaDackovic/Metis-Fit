import { z } from 'zod';
import {
  barOrderBody,
  cafeCancelBody,
  cafeCategoryBody,
  cafeCategoryDto,
  cafeItemBody,
  cafeMenuDto,
  cafeOrderDto,
  cafeOrdersQuery,
  cafeOrderStatusBody,
  cafePayBody,
  cafeSettingsBody,
  cafeSettingsDto,
  cafeStockBody,
  cafeTableBody,
  cafeTableDto,
  clubMediaBody,
  guestOrderParams,
  guestOrderQuery,
  idParams,
  memberOrderBody,
  normalizeLocaleParam,
  placedOrderDto,
  tableOrderBody,
} from '@grit/validation';
import type { AppDeps } from '../../app';
import { createAttemptLimiter } from '../../shared/attempt-limiter';
import { access, defineRoute } from '../../shared/route';
import { createCafeService } from './cafe.service';
import { deliverFiscal } from './pos';

const TAG = ['Café'];
const localeQuery = z.object({ locale: normalizeLocaleParam });
const ok = z.object({ ok: z.literal(true) });
const svc = (deps: AppDeps) =>
  createCafeService(deps.db, deps.media, Boolean(deps.posSecretConfigured));
/** Guest orders from table QR codes: per IP, enough for a table, not for a script. */
export const tableOrderLimiter = createAttemptLimiter({ max: 20, windowMs: 10 * 60_000 });
/** Hand a paid order to the POS right away (the scheduler retries failures). */
const sendFiscal = (deps: AppDeps, id: string) => {
  if (deps.posSender) void deliverFiscal(deps.db, deps.posSender, id).catch(() => undefined);
};

export const cafeRoutes = [
  // ── Public: menu and table QR ordering ──────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/public/cafe/menu',
    access: access.public,
    summary: 'Café menu (available items); with ?table=<code> also the table the QR belongs to',
    tags: TAG,
    query: localeQuery.extend({
      table: z
        .string()
        .regex(/^[A-Za-z0-9]{10,32}$/)
        .optional(),
    }),
    response: cafeMenuDto,
    handler: async ({ query, deps }) => ({
      data: await svc(deps).publicMenu(query.locale, query.table),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/public/cafe/orders',
    access: access.public,
    summary: 'Order from a table QR code without an account (paid at the bar or when served)',
    tags: TAG,
    query: localeQuery,
    body: tableOrderBody,
    response: placedOrderDto,
    handler: async ({ query, body, req, deps }) => {
      tableOrderLimiter.hit(req.ip ?? 'unknown');
      return { status: 201, data: await svc(deps).tableOrder(query.locale, body) };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/public/cafe/orders/:id',
    access: access.public,
    summary: 'Follow an order placed from a table (needs the token returned when ordering)',
    tags: TAG,
    params: guestOrderParams,
    query: guestOrderQuery,
    response: cafeOrderDto,
    handler: async ({ params, query, deps }) => ({
      data: await svc(deps).guestOrder(params.id, query.token),
    }),
  }),

  // ── Members ─────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'post',
    path: '/me/cafe/orders',
    access: access.self,
    summary: 'Order in the app: pick up at the bar, or to a table when its QR was scanned',
    tags: TAG,
    query: localeQuery,
    body: memberOrderBody,
    response: placedOrderDto,
    handler: async ({ actor, query, body, deps }) => ({
      status: 201,
      data: await svc(deps).memberOrder(actor!, query.locale, body),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/me/cafe/orders',
    access: access.self,
    summary: 'My café orders (latest 30)',
    tags: TAG,
    response: z.array(cafeOrderDto),
    handler: async ({ actor, deps }) => ({ data: await svc(deps).myOrders(actor!) }),
  }),

  // ── Bar ─────────────────────────────────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/cafe/orders',
    access: access.can('cafe.orders'),
    summary: 'Order board: open orders, or everything today',
    tags: TAG,
    query: cafeOrdersQuery,
    response: z.array(cafeOrderDto),
    handler: async ({ query, deps }) => ({ data: await svc(deps).orders(query.view) }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/orders',
    access: access.can('cafe.orders'),
    summary: 'Order taken at the bar (optionally charged right away)',
    tags: TAG,
    query: localeQuery,
    body: barOrderBody,
    response: cafeOrderDto,
    handler: async ({ actor, req, query, body, deps }) => {
      const data = await svc(deps).barOrder(actor!, req, query.locale, body);
      if (data.paymentStatus === 'paid') sendFiscal(deps, data.id);
      return { status: 201, data };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/orders/:id/status',
    access: access.can('cafe.orders'),
    summary: 'Move an order forward (preparing, ready, served)',
    tags: TAG,
    params: idParams,
    body: cafeOrderStatusBody,
    response: cafeOrderDto,
    handler: async ({ actor, params, body, deps }) => ({
      data: await svc(deps).setStatus(actor!, params.id, body.status),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/orders/:id/pay',
    access: access.can('cafe.orders'),
    summary:
      'Charge an order; with a POS webhook configured it is handed over for the fiscal receipt',
    tags: TAG,
    params: idParams,
    body: cafePayBody,
    response: cafeOrderDto,
    handler: async ({ actor, req, params, body, deps }) => {
      const data = await svc(deps).pay(actor!, req, params.id, body.method);
      sendFiscal(deps, data.id);
      return { data };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/orders/:id/cancel',
    access: access.can('cafe.orders'),
    summary: 'Cancel an unpaid order (stock goes back)',
    tags: TAG,
    params: idParams,
    body: cafeCancelBody,
    response: cafeOrderDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).cancel(actor!, req, params.id, body.reason),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/orders/:id/fiscal-retry',
    access: access.can('cafe.orders'),
    summary: 'Send a failed POS hand-over again',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ params, deps }) => {
      const data = await svc(deps).retryFiscal(params.id);
      sendFiscal(deps, params.id);
      return { data };
    },
  }),

  // ── Menu, stock, tables, settings ───────────────────────────────────────────
  defineRoute({
    method: 'get',
    path: '/admin/cafe/menu',
    access: access.can('cafe.orders'),
    summary: 'Full menu with stock (including hidden items)',
    tags: TAG,
    query: localeQuery,
    response: z.array(cafeCategoryDto),
    handler: async ({ query, deps }) => ({ data: await svc(deps).staffMenu(query.locale) }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/categories',
    access: access.can('cafe.manage'),
    summary: 'Add a menu category',
    tags: TAG,
    query: localeQuery,
    body: cafeCategoryBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, query, body, deps }) => ({
      status: 201,
      data: await svc(deps).saveCategory(actor!, req, query.locale, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/cafe/categories/:id',
    access: access.can('cafe.manage'),
    summary: 'Edit a menu category',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: cafeCategoryBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).saveCategory(actor!, req, query.locale, body, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/items',
    access: access.can('cafe.manage'),
    summary: 'Add a menu item',
    tags: TAG,
    query: localeQuery,
    body: cafeItemBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, query, body, deps }) => ({
      status: 201,
      data: await svc(deps).saveItem(actor!, req, query.locale, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/cafe/items/:id',
    access: access.can('cafe.manage'),
    summary: 'Edit a menu item (price changes are audited)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: cafeItemBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).saveItem(actor!, req, query.locale, body, params.id),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/cafe/media/items/:id',
    access: access.can('cafe.manage'),
    summary: 'Upload a menu item photo',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: clubMediaBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).itemPhoto(actor!, req, query.locale, params.id, body.image),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/items/:id/stock',
    access: access.can('cafe.orders'),
    summary: 'Restock, correct or write off stock (never below zero)',
    tags: TAG,
    params: idParams,
    query: localeQuery,
    body: cafeStockBody,
    response: z.array(cafeCategoryDto),
    handler: async ({ actor, req, params, query, body, deps }) => ({
      data: await svc(deps).adjustStock(
        actor!,
        req,
        query.locale,
        params.id,
        body.delta,
        body.reason,
        body.note ?? null,
      ),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/cafe/tables',
    access: access.can('cafe.orders'),
    summary: 'Tables with their QR codes',
    tags: TAG,
    response: z.array(cafeTableDto),
    handler: async ({ deps }) => ({ data: await svc(deps).tables() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/tables',
    access: access.can('cafe.manage'),
    summary: 'Add a table (gets its own QR code)',
    tags: TAG,
    body: cafeTableBody,
    response: ok,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await svc(deps).saveTable(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/cafe/tables/:id',
    access: access.can('cafe.manage'),
    summary: 'Rename or switch off a table',
    tags: TAG,
    params: idParams,
    body: cafeTableBody,
    response: ok,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await svc(deps).saveTable(actor!, req, body, params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/cafe/tables/:id/regenerate',
    access: access.can('cafe.manage'),
    summary: 'New QR code for a table (the old printed code stops working)',
    tags: TAG,
    params: idParams,
    response: ok,
    handler: async ({ actor, req, params, deps }) => ({
      data: await svc(deps).regenerateTable(actor!, req, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/cafe/settings',
    access: access.can('cafe.manage'),
    summary: 'Café switches and the POS / fiscal adapter',
    tags: TAG,
    response: cafeSettingsDto,
    handler: async ({ deps }) => ({ data: await svc(deps).settings() }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/cafe/settings',
    access: access.can('cafe.manage'),
    summary: 'Change café switches and the POS / fiscal adapter',
    tags: TAG,
    body: cafeSettingsBody,
    response: ok,
    handler: async ({ actor, req, body, deps }) => ({
      data: await svc(deps).saveSettings(actor!, req, body),
    }),
  }),
];
