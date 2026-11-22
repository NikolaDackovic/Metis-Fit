import { z } from 'zod';
import {
  documentBody,
  documentDto,
  documentsQuery,
  financeDto,
  financeQuery,
  idParams,
  partnerBody,
  partnerCardDto,
  partnerCardQuery,
  partnerDto,
  payDocumentBody,
  stockCountBody,
  stockCountDto,
  voidDocumentBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createPurchasesService } from './purchases.service';

const TAG = ['Business'];
const manage = access.can('purchases.manage');

export const purchasesRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/partners',
    access: manage,
    summary: 'Partners (komitenti): suppliers and customers',
    tags: TAG,
    response: z.array(partnerDto),
    handler: async ({ deps }) => ({ data: await createPurchasesService(deps.db).partners() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/partners',
    access: manage,
    summary: 'Add a partner',
    tags: TAG,
    body: partnerBody,
    response: partnerDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createPurchasesService(deps.db).savePartner(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/partners/:id',
    access: manage,
    summary: 'Edit a partner',
    tags: TAG,
    params: idParams,
    body: partnerBody,
    response: partnerDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPurchasesService(deps.db).savePartner(actor!, req, body, params.id),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/partners/:id/card',
    access: manage,
    summary: 'Partner card: documents in a period with totals and balance',
    tags: TAG,
    params: idParams,
    query: partnerCardQuery,
    response: partnerCardDto,
    handler: async ({ params, query, deps }) => ({
      data: await createPurchasesService(deps.db).partnerCard(params.id, query.from, query.to),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/documents',
    access: manage,
    summary: 'Incoming and outgoing invoices',
    tags: TAG,
    query: documentsQuery,
    response: z.array(documentDto),
    handler: async ({ query, deps }) => ({
      data: await createPurchasesService(deps.db).documents(query),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/documents/:id',
    access: manage,
    summary: 'One document with its lines',
    tags: TAG,
    params: idParams,
    response: documentDto,
    handler: async ({ params, deps }) => ({
      data: await createPurchasesService(deps.db).document(params.id),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/documents',
    access: manage,
    summary: 'Enter a document; lines linked to café items move the stock',
    tags: TAG,
    body: documentBody,
    response: documentDto,
    handler: async ({ actor, req, body, deps }) => ({
      status: 201,
      data: await createPurchasesService(deps.db).create(actor!, req, body),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/documents/:id/pay',
    access: manage,
    summary: 'Mark a document as paid',
    tags: TAG,
    params: idParams,
    body: payDocumentBody,
    response: documentDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPurchasesService(deps.db).pay(
        actor!,
        req,
        params.id,
        body.paidOn,
        body.method,
      ),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/documents/:id/void',
    access: manage,
    summary: 'Void a document (its stock movements are undone)',
    tags: TAG,
    params: idParams,
    body: voidDocumentBody,
    response: documentDto,
    handler: async ({ actor, req, params, body, deps }) => ({
      data: await createPurchasesService(deps.db).void(actor!, req, params.id, body.reason),
    }),
  }),
  defineRoute({
    method: 'get',
    path: '/admin/stock-counts',
    access: manage,
    summary: 'Stock counts (popis)',
    tags: TAG,
    response: z.array(stockCountDto),
    handler: async ({ deps }) => ({ data: await createPurchasesService(deps.db).stockCounts() }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/stock-counts',
    access: manage,
    summary: 'Record a stock count; differences are booked as adjustments',
    tags: TAG,
    body: stockCountBody,
    response: z.array(stockCountDto),
    handler: async ({ actor, req, body, deps }) => {
      const s = createPurchasesService(deps.db);
      await s.createStockCount(actor!, req, body);
      return { status: 201, data: await s.stockCounts() };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/admin/finance',
    access: access.can('finance.read'),
    summary: 'Monthly overview: income, costs, VAT and open invoices',
    tags: TAG,
    query: financeQuery,
    response: financeDto,
    handler: async ({ query, deps }) => ({
      data: await createPurchasesService(deps.db).finance(query.month),
    }),
  }),
];
