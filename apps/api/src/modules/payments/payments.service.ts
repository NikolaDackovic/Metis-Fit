import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type { ListPaymentsQuery, PaymentDto, RecordPaymentBody } from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

/** Calendar dates are interpreted in the club's time zone. */
const dayStart = (d: string) => sql<Date>`(${d}::date)::timestamp at time zone 'Europe/Belgrade'`;

function baseQuery(tx: Tx) {
  return tx
    .selectFrom('payments as p')
    .innerJoin('members as m', 'm.id', 'p.member_id')
    .innerJoin('profiles as staff', 'staff.id', 'p.recorded_by')
    .leftJoin('memberships as ms', 'ms.id', 'p.membership_id')
    .leftJoin('membership_plan_translations as t', (j) =>
      j.onRef('t.plan_id', '=', 'ms.plan_id').on('t.locale', '=', 'sr'),
    );
}

async function load(tx: Tx, q: Partial<ListPaymentsQuery> & { id?: string }) {
  let query = baseQuery(tx);
  if (q.id) query = query.where('p.id', '=', q.id);
  if (q.memberId) query = query.where('p.member_id', '=', q.memberId);
  if (q.method) query = query.where('p.method', '=', q.method);
  if (q.from) query = query.where('p.paid_at', '>=', dayStart(q.from));
  if (q.to) query = query.where('p.paid_at', '<', sql<Date>`${dayStart(q.to)} + interval '1 day'`);

  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  const [rows, count] = await Promise.all([
    query
      .select([
        'p.id',
        'p.member_id',
        'p.membership_id',
        'p.amount',
        'p.currency',
        'p.method',
        'p.status',
        'p.paid_at',
        'p.note',
        'p.refund_of',
        'p.void_reason',
        'm.member_number',
        sql<string>`m.first_name || ' ' || m.last_name`.as('member_name'),
        sql<string>`trim(staff.first_name || ' ' || staff.last_name)`.as('staff_name'),
        't.name as plan_name',
        (eb) =>
          eb
            .selectFrom('payments as r')
            .select(sql<number>`coalesce(-sum(r.amount), 0)::int`.as('v'))
            .whereRef('r.refund_of', '=', 'p.id')
            .where('r.status', '=', 'recorded')
            .as('refunded_amount'),
      ])
      .orderBy('p.paid_at', 'desc')
      .orderBy('p.id')
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .execute(),
    query.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow(),
  ]);

  const items: PaymentDto[] = rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name,
    memberNumber: r.member_number,
    membershipId: r.membership_id,
    planName: r.plan_name ?? null,
    amount: r.amount,
    currency: r.currency,
    method: r.method,
    status: r.status,
    paidAt: new Date(r.paid_at).toISOString(),
    note: r.note,
    refundOf: r.refund_of,
    refundedAmount: Number(r.refunded_amount ?? 0),
    voidReason: r.void_reason,
    recordedByName: r.staff_name || '-',
  }));
  return { items, total: Number(count.n) };
}

async function one(tx: Tx, id: string): Promise<PaymentDto> {
  const { items } = await load(tx, { id });
  if (!items[0]) throw notFound('payment');
  return items[0];
}

export function createPaymentsService(db: Kysely<DB>) {
  return {
    list: (q: ListPaymentsQuery) => withStaffTx(db, (tx) => load(tx, q)),

    async record(actor: Actor, req: Request, input: RecordPaymentBody): Promise<PaymentDto> {
      return withStaffTx(db, async (tx) => {
        const member = await tx
          .selectFrom('members')
          .select('id')
          .where('id', '=', input.memberId)
          .executeTakeFirst();
        if (!member) throw notFound('member');
        let currency = 'RSD';
        if (input.membershipId) {
          const ms = await tx
            .selectFrom('memberships')
            .select(['member_id', 'currency'])
            .where('id', '=', input.membershipId)
            .executeTakeFirst();
          if (!ms) throw notFound('membership');
          if (ms.member_id !== input.memberId) {
            throw new AppError('BUSINESS_RULE', 'errors.payment.membership_mismatch');
          }
          currency = ms.currency;
        }
        const row = await tx
          .insertInto('payments')
          .values({
            member_id: input.memberId,
            membership_id: input.membershipId ?? null,
            amount: input.amount,
            currency,
            method: input.method,
            note: input.note ?? null,
            recorded_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'payment.create',
          entityType: 'payment',
          entityId: row.id,
          diff: { after: { ...input } },
        });
        return one(tx, row.id);
      });
    },

    async void(actor: Actor, req: Request, id: string, reason: string): Promise<PaymentDto> {
      return withStaffTx(db, async (tx) => {
        const p = await tx
          .selectFrom('payments')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!p) throw notFound('payment');
        if (p.status === 'voided')
          throw new AppError('BUSINESS_RULE', 'errors.payment.already_voided');
        const activeRefund = await tx
          .selectFrom('payments')
          .select('id')
          .where('refund_of', '=', id)
          .where('status', '=', 'recorded')
          .executeTakeFirst();
        if (activeRefund) throw new AppError('BUSINESS_RULE', 'errors.payment.has_refunds');
        await tx
          .updateTable('payments')
          .set({
            status: 'voided',
            void_reason: reason,
            voided_by: actor.userId,
            voided_at: new Date(),
          })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'payment.void',
          entityType: 'payment',
          entityId: id,
          diff: { before: { status: 'recorded' }, after: { status: 'voided', reason } },
        });
        return one(tx, id);
      });
    },

    async refund(
      actor: Actor,
      req: Request,
      id: string,
      amount: number,
      reason: string,
    ): Promise<PaymentDto> {
      return withStaffTx(db, async (tx) => {
        const p = await tx
          .selectFrom('payments')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!p) throw notFound('payment');
        if (p.status !== 'recorded' || p.amount < 0) {
          throw new AppError('BUSINESS_RULE', 'errors.payment.not_refundable');
        }
        const { refunded } = await tx
          .selectFrom('payments')
          .select(sql<number>`coalesce(-sum(amount), 0)::int`.as('refunded'))
          .where('refund_of', '=', id)
          .where('status', '=', 'recorded')
          .executeTakeFirstOrThrow();
        if (amount > p.amount - refunded) {
          throw new AppError('BUSINESS_RULE', 'errors.payment.refund_exceeds', [
            { path: 'amount', refundable: p.amount - refunded },
          ]);
        }
        const row = await tx
          .insertInto('payments')
          .values({
            member_id: p.member_id,
            membership_id: p.membership_id,
            amount: -amount,
            currency: p.currency,
            method: p.method,
            refund_of: id,
            note: reason,
            recorded_by: actor.userId,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, actor, req, {
          action: 'payment.refund',
          entityType: 'payment',
          entityId: row.id,
          diff: { after: { refundOf: id, amount, reason } },
        });
        return one(tx, row.id);
      });
    },
  };
}
