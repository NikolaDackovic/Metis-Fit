import { z } from 'zod';
import {
  idParams,
  listPaymentsQuery,
  paymentDto,
  recordPaymentBody,
  refundPaymentBody,
  voidPaymentBody,
} from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createPaymentsService } from './payments.service';

// Payment records are an internal ledger, NOT fiscal receipts (docs/BUSINESS_RULES.md §3).
const tags = ['Payments'];

export const paymentsRoutes = [
  defineRoute({
    method: 'get',
    path: '/admin/payments',
    access: access.can('payments.read'),
    summary: 'List payments (filter by date range, method, member)',
    tags,
    query: listPaymentsQuery,
    response: z.array(paymentDto),
    handler: async ({ query, deps }) => {
      const { items, total } = await createPaymentsService(deps.db).list(query);
      return { data: items, meta: { page: query.page, pageSize: query.pageSize, total } };
    },
  }),
  defineRoute({
    method: 'post',
    path: '/admin/payments',
    access: access.can('payments.create'),
    summary: 'Record a payment',
    tags,
    body: recordPaymentBody,
    response: paymentDto,
    handler: async ({ body, actor, req, deps }) => ({
      data: await createPaymentsService(deps.db).record(actor!, req, body),
      status: 201,
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/payments/:id/void',
    access: access.can('payments.void'),
    summary: 'Void a payment (the record is kept, reason required)',
    tags,
    params: idParams,
    body: voidPaymentBody,
    response: paymentDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createPaymentsService(deps.db).void(actor!, req, params.id, body.reason),
    }),
  }),
  defineRoute({
    method: 'post',
    path: '/admin/payments/:id/refund',
    access: access.can('payments.refund'),
    summary: 'Refund part or all of a payment (creates a negative entry)',
    tags,
    params: idParams,
    body: refundPaymentBody,
    response: paymentDto,
    handler: async ({ params, body, actor, req, deps }) => ({
      data: await createPaymentsService(deps.db).refund(
        actor!,
        req,
        params.id,
        body.amount,
        body.reason,
      ),
      status: 201,
    }),
  }),
];
