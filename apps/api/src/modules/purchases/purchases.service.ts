import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import {
  lineAmounts,
  type DocumentBody,
  type DocumentDto,
  type FinanceDto,
  type PartnerBody,
  type PartnerCardDto,
  type PartnerDto,
  type StockCountDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';

const day = (d: unknown) => (d == null ? null : String(d).slice(0, 10));
const itemName = (tr: unknown) => {
  const t = (tr ?? {}) as Record<string, { name?: string }>;
  return t.sr?.name ?? Object.values(t)[0]?.name ?? '-';
};

type PartnerRow = {
  id: string;
  name: string;
  tax_id: string | null;
  registry_no: string | null;
  city: string | null;
  address: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  is_supplier: boolean;
  is_customer: boolean;
  is_active: boolean;
  note: string | null;
};
function toPartner(p: PartnerRow): PartnerDto {
  return {
    id: p.id,
    name: p.name,
    taxId: p.tax_id,
    registryNo: p.registry_no,
    city: p.city,
    address: p.address,
    contact: p.contact,
    email: p.email,
    phone: p.phone,
    isSupplier: p.is_supplier,
    isCustomer: p.is_customer,
    isActive: p.is_active,
    note: p.note,
  };
}

async function partners(tx: Tx): Promise<PartnerDto[]> {
  return (await tx.selectFrom('partners').selectAll().orderBy('name').execute()).map(toPartner);
}

async function documents(
  tx: Tx,
  where: { id?: string; kind?: string; status?: string; month?: string; partnerId?: string },
): Promise<DocumentDto[]> {
  let q = tx
    .selectFrom('business_documents as d')
    .innerJoin('partners as p', 'p.id', 'd.partner_id')
    .selectAll('d')
    .select([
      'p.name as partner_name',
      'p.tax_id as partner_tax_id',
      sql<boolean>`d.status = 'unpaid' and d.due_on < public.club_today()`.as('overdue'),
    ])
    .orderBy('d.turnover_on', 'desc')
    .orderBy('d.internal_no', 'desc')
    .limit(500);
  if (where.id) q = q.where('d.id', '=', where.id);
  if (where.kind && where.kind !== 'all') q = q.where('d.kind', '=', where.kind);
  if (where.status && where.status !== 'all') q = q.where('d.status', '=', where.status);
  if (where.partnerId) q = q.where('d.partner_id', '=', where.partnerId);
  if (where.month) q = q.where(sql<boolean>`to_char(d.turnover_on, 'YYYY-MM') = ${where.month}`);
  const rows = await q.execute();
  const lines = rows.length
    ? await tx
        .selectFrom('business_document_lines')
        .selectAll()
        .where(
          'document_id',
          'in',
          rows.map((r) => r.id),
        )
        .orderBy('position')
        .execute()
    : [];
  return rows.map((r) => ({
    id: r.id,
    internalNo: r.internal_no,
    kind: r.kind as DocumentDto['kind'],
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    partnerTaxId: r.partner_tax_id,
    number: r.number,
    turnoverOn: day(r.turnover_on)!,
    dueOn: day(r.due_on),
    netAmount: r.net_amount,
    discountAmount: r.discount_amount,
    vatAmount: r.vat_amount,
    totalAmount: r.total_amount,
    currency: r.currency,
    status: r.status as DocumentDto['status'],
    paidOn: day(r.paid_on),
    paymentMethod: r.payment_method,
    note: r.note,
    internalNote: r.internal_note,
    voidReason: r.void_reason,
    overdue: Boolean(r.overdue),
    lines: lines
      .filter((l) => l.document_id === r.id)
      .map((l) => ({
        cafeItemId: l.cafe_item_id,
        category: l.category,
        name: l.name,
        unit: l.unit,
        qty: Number(l.qty),
        unitPrice: l.unit_price,
        discountPct: Number(l.discount_pct),
        vatRate: Number(l.vat_rate),
        netAmount: l.net_amount,
        vatAmount: l.vat_amount,
        totalAmount: l.total_amount,
      })),
  }));
}

/** Moves café stock by `delta` (never below zero) and records the movement. */
async function moveStock(
  tx: Tx,
  actor: Actor,
  itemId: string,
  delta: number,
  reason: 'restock' | 'adjust',
  note: string,
) {
  const item = await tx
    .selectFrom('cafe_items')
    .select(['stock_qty'])
    .where('id', '=', itemId)
    .forUpdate()
    .executeTakeFirst();
  if (!item) throw notFound('cafe_item');
  const next = (item.stock_qty ?? 0) + delta;
  if (next < 0) throw new AppError('BUSINESS_RULE', 'errors.document.not_enough_stock');
  await tx
    .updateTable('cafe_items')
    .set({ stock_qty: next, track_stock: true })
    .where('id', '=', itemId)
    .execute();
  await tx
    .insertInto('cafe_stock_movements')
    .values({ item_id: itemId, delta, reason, note, created_by: actor.userId })
    .execute();
}

export function createPurchasesService(db: Kysely<DB>) {
  return {
    // ---- partners (komitenti) ----
    partners: () => withStaffTx(db, partners),
    savePartner: (actor: Actor, req: Request, b: PartnerBody, id?: string) =>
      withStaffTx(db, async (tx) => {
        const v = {
          name: b.name,
          tax_id: b.taxId ?? null,
          registry_no: b.registryNo ?? null,
          city: b.city ?? null,
          address: b.address ?? null,
          contact: b.contact ?? null,
          email: b.email ?? null,
          phone: b.phone ?? null,
          is_supplier: b.isSupplier,
          is_customer: b.isCustomer,
          is_active: b.isActive,
          note: b.note ?? null,
        };
        let saved: string;
        try {
          if (id) {
            const r = await tx
              .updateTable('partners')
              .set(v)
              .where('id', '=', id)
              .executeTakeFirst();
            if (!Number(r.numUpdatedRows)) throw notFound('partner');
            saved = id;
          } else {
            saved = (
              await tx.insertInto('partners').values(v).returning('id').executeTakeFirstOrThrow()
            ).id;
          }
        } catch (e) {
          if ((e as { code?: string }).code === '23505')
            throw new AppError('CONFLICT', 'errors.partner.tax_id_taken');
          throw e;
        }
        await writeAudit(tx, actor, req, {
          action: 'partner.save',
          entityType: 'partner',
          entityId: saved,
          diff: { after: { name: b.name, taxId: b.taxId ?? null } },
        });
        return toPartner(
          await tx
            .selectFrom('partners')
            .selectAll()
            .where('id', '=', saved)
            .executeTakeFirstOrThrow(),
        );
      }),

    /** Kartica komitenta: every document with the partner in a period, with totals. */
    partnerCard: (id: string, from: string, to: string) =>
      withStaffTx(db, async (tx): Promise<PartnerCardDto> => {
        const p = await tx
          .selectFrom('partners')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        if (!p) throw notFound('partner');
        const rows = await tx
          .selectFrom('business_documents')
          .selectAll()
          .where('partner_id', '=', id)
          .where('turnover_on', '>=', from)
          .where('turnover_on', '<=', to)
          .orderBy('turnover_on')
          .orderBy('internal_no')
          .execute();
        const live = rows.filter((r) => r.status !== 'void');
        const sum = (kind: string, unpaid = false) =>
          live
            .filter((r) => r.kind === kind && (!unpaid || r.status === 'unpaid'))
            .reduce((s, r) => s + r.total_amount, 0);
        const incomingUnpaid = sum('incoming_invoice', true);
        const outgoingUnpaid = sum('outgoing_invoice', true);
        return {
          partner: toPartner(p),
          from,
          to,
          rows: rows.map((r) => ({
            id: r.id,
            internalNo: r.internal_no,
            kind: r.kind as 'incoming_invoice' | 'outgoing_invoice',
            number: r.number,
            turnoverOn: day(r.turnover_on)!,
            dueOn: day(r.due_on),
            status: r.status as 'unpaid' | 'paid' | 'void',
            netAmount: r.net_amount,
            vatAmount: r.vat_amount,
            totalAmount: r.total_amount,
            paidOn: day(r.paid_on),
          })),
          totals: {
            incoming: sum('incoming_invoice'),
            outgoing: sum('outgoing_invoice'),
            incomingUnpaid,
            outgoingUnpaid,
            balance: outgoingUnpaid - incomingUnpaid,
          },
        };
      }),

    // ---- documents ----
    documents: (q: { kind?: string; status?: string; month?: string; partnerId?: string }) =>
      withStaffTx(db, (tx) => documents(tx, q)),
    document: (id: string) =>
      withStaffTx(db, async (tx) => {
        const d = (await documents(tx, { id }))[0];
        if (!d) throw notFound('document');
        return d;
      }),
    create: (actor: Actor, req: Request, b: DocumentBody) =>
      withStaffTx(db, async (tx) => {
        const partner = await tx
          .selectFrom('partners')
          .select(['is_supplier', 'is_customer'])
          .where('id', '=', b.partnerId)
          .executeTakeFirst();
        if (!partner) throw notFound('partner');
        if (b.kind === 'incoming_invoice' && !partner.is_supplier)
          throw new AppError('BUSINESS_RULE', 'errors.document.partner_not_supplier');
        if (b.kind === 'outgoing_invoice' && !partner.is_customer)
          throw new AppError('BUSINESS_RULE', 'errors.document.partner_not_customer');

        const lines = b.lines.map((l) => ({ ...l, ...lineAmounts(l) }));
        const totals = lines.reduce(
          (s, l) => ({
            net: s.net + l.net,
            discount: s.discount + l.discount,
            vat: s.vat + l.vat,
            total: s.total + l.total,
          }),
          { net: 0, discount: 0, vat: 0, total: 0 },
        );
        let doc: { id: string };
        try {
          doc = await tx
            .insertInto('business_documents')
            .values({
              kind: b.kind,
              partner_id: b.partnerId,
              number: b.number,
              turnover_on: b.turnoverOn,
              due_on: b.dueOn ?? null,
              net_amount: totals.net,
              discount_amount: totals.discount,
              vat_amount: totals.vat,
              total_amount: totals.total,
              note: b.note ?? null,
              internal_note: b.internalNote ?? null,
              status: b.paid ? 'paid' : 'unpaid',
              paid_on: b.paid?.paidOn ?? null,
              payment_method: b.paid?.method ?? null,
              created_by: actor.userId,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
        } catch (e) {
          if ((e as { code?: string }).code === '23505')
            throw new AppError('CONFLICT', 'errors.document.duplicate');
          throw e;
        }
        const sign = b.kind === 'incoming_invoice' ? 1 : -1;
        for (const [i, l] of lines.entries()) {
          await tx
            .insertInto('business_document_lines')
            .values({
              document_id: doc.id,
              position: i + 1,
              cafe_item_id: l.cafeItemId ?? null,
              category: l.cafeItemId ? 'goods' : l.category,
              name: l.name,
              unit: l.unit,
              qty: l.qty,
              unit_price: l.unitPrice,
              discount_pct: l.discountPct,
              vat_rate: l.vatRate,
              net_amount: l.net,
              vat_amount: l.vat,
              total_amount: l.total,
            })
            .execute();
          // Goods in raise the café stock, goods out lower it.
          if (l.cafeItemId)
            await moveStock(
              tx,
              actor,
              l.cafeItemId,
              sign * l.qty,
              sign > 0 ? 'restock' : 'adjust',
              b.number,
            );
        }
        await writeAudit(tx, actor, req, {
          action: 'document.create',
          entityType: 'business_document',
          entityId: doc.id,
          diff: { after: { kind: b.kind, number: b.number, total: totals.total } },
        });
        return (await documents(tx, { id: doc.id }))[0]!;
      }),
    pay: (actor: Actor, req: Request, id: string, paidOn: string, method: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('business_documents')
          .set({ status: 'paid', paid_on: paidOn, payment_method: method })
          .where('id', '=', id)
          .where('status', '=', 'unpaid')
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw new AppError('CONFLICT', 'errors.document.not_unpaid');
        await writeAudit(tx, actor, req, {
          action: 'document.pay',
          entityType: 'business_document',
          entityId: id,
          diff: { after: { paidOn, method } },
        });
        return (await documents(tx, { id }))[0]!;
      }),
    void: (actor: Actor, req: Request, id: string, reason: string) =>
      withStaffTx(db, async (tx) => {
        const doc = await tx
          .selectFrom('business_documents')
          .select(['status', 'number', 'kind'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!doc) throw notFound('document');
        if (doc.status === 'void') throw new AppError('CONFLICT', 'errors.document.already_void');
        const linked = await tx
          .selectFrom('business_document_lines')
          .select(['cafe_item_id', 'qty'])
          .where('document_id', '=', id)
          .where('cafe_item_id', 'is not', null)
          .execute();
        const sign = doc.kind === 'incoming_invoice' ? -1 : 1; // undo the original movement
        for (const l of linked) {
          try {
            await moveStock(
              tx,
              actor,
              l.cafe_item_id!,
              sign * Number(l.qty),
              'adjust',
              `${doc.number} (storno)`,
            );
          } catch (e) {
            if (e instanceof AppError && e.message === 'errors.document.not_enough_stock')
              throw new AppError('BUSINESS_RULE', 'errors.document.stock_used');
            throw e;
          }
        }
        await tx
          .updateTable('business_documents')
          .set({ status: 'void', void_reason: reason })
          .where('id', '=', id)
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'document.void',
          entityType: 'business_document',
          entityId: id,
          diff: { after: { reason } },
        });
        return (await documents(tx, { id }))[0]!;
      }),

    // ---- stock counts (popis) ----
    stockCounts: () =>
      withStaffTx(db, async (tx): Promise<StockCountDto[]> => {
        const counts = await tx
          .selectFrom('stock_counts')
          .selectAll()
          .orderBy('counted_on', 'desc')
          .orderBy('created_at', 'desc')
          .limit(50)
          .execute();
        const lines = counts.length
          ? await tx
              .selectFrom('stock_count_lines as l')
              .innerJoin('cafe_items as i', 'i.id', 'l.cafe_item_id')
              .select([
                'l.count_id',
                'l.cafe_item_id',
                'l.system_qty',
                'l.counted_qty',
                'i.translations',
              ])
              .where(
                'l.count_id',
                'in',
                counts.map((c) => c.id),
              )
              .execute()
          : [];
        return counts.map((c) => ({
          id: c.id,
          countedOn: day(c.counted_on)!,
          note: c.note,
          createdAt: new Date(c.created_at as unknown as string).toISOString(),
          lines: lines
            .filter((l) => l.count_id === c.id)
            .map((l) => ({
              cafeItemId: l.cafe_item_id,
              name: itemName(l.translations),
              systemQty: l.system_qty,
              countedQty: l.counted_qty,
              diff: l.counted_qty - l.system_qty,
            })),
        }));
      }),
    createStockCount: (
      actor: Actor,
      req: Request,
      b: {
        countedOn: string;
        note?: string | null;
        lines: Array<{ cafeItemId: string; countedQty: number }>;
      },
    ) =>
      withStaffTx(db, async (tx) => {
        const count = await tx
          .insertInto('stock_counts')
          .values({ counted_on: b.countedOn, note: b.note ?? null, created_by: actor.userId })
          .returning('id')
          .executeTakeFirstOrThrow();
        for (const l of b.lines) {
          const item = await tx
            .selectFrom('cafe_items')
            .select('stock_qty')
            .where('id', '=', l.cafeItemId)
            .forUpdate()
            .executeTakeFirst();
          if (!item) throw notFound('cafe_item');
          const system = item.stock_qty ?? 0;
          await tx
            .insertInto('stock_count_lines')
            .values({
              count_id: count.id,
              cafe_item_id: l.cafeItemId,
              system_qty: system,
              counted_qty: l.countedQty,
            })
            .execute();
          if (l.countedQty !== system)
            await moveStock(
              tx,
              actor,
              l.cafeItemId,
              l.countedQty - system,
              'adjust',
              `Popis ${b.countedOn}`,
            );
        }
        await writeAudit(tx, actor, req, {
          action: 'stock_count.create',
          entityType: 'stock_count',
          entityId: count.id,
          diff: { after: { countedOn: b.countedOn, items: b.lines.length } },
        });
        return count.id;
      }),

    /** Month in club time: what came in and what went out, plus VAT. */
    finance: (month: string) =>
      withStaffTx(db, async (tx): Promise<FinanceDto> => {
        const from = `${month}-01`;
        const inMonth = (col: string) =>
          sql<boolean>`(${sql.ref(col)} at time zone 'Europe/Belgrade')::date >= ${from}::date
                       and (${sql.ref(col)} at time zone 'Europe/Belgrade')::date < (${from}::date + interval '1 month')`;
        const docMonth = sql<boolean>`d.status <> 'void' and to_char(d.turnover_on, 'YYYY-MM') = ${month}`;
        const r = await sql<{
          memberships: number;
          services: number;
          cafe: number;
          shares: number;
          invoices: number;
          vat_in: number;
          vat_out: number;
        }>`
          select
            (select coalesce(sum(amount), 0)::int from public.payments p where p.status = 'recorded' and ${inMonth('p.paid_at')}) as memberships,
            (select coalesce(sum(total_amount), 0)::int from public.service_sales s where s.voided_at is null and ${inMonth('s.sold_at')}) as services,
            (select coalesce(sum(total_amount), 0)::int from public.cafe_orders o where o.payment_status = 'paid' and ${inMonth('o.paid_at')}) as cafe,
            ((select coalesce(sum(trainer_share_amount), 0) from public.service_sales s where s.voided_at is null and ${inMonth('s.sold_at')})
             + (select coalesce(sum(trainer_share_amount), 0) from public.pt_sessions ps
                where ps.voided_at is null and ps.held_on >= ${from}::date and ps.held_on < (${from}::date + interval '1 month')))::int as shares,
            (select coalesce(sum(net_amount), 0)::int from public.business_documents d where d.kind = 'outgoing_invoice' and ${docMonth}) as invoices,
            (select coalesce(sum(vat_amount), 0)::int from public.business_documents d where d.kind = 'incoming_invoice' and ${docMonth}) as vat_in,
            (select coalesce(sum(vat_amount), 0)::int from public.business_documents d where d.kind = 'outgoing_invoice' and ${docMonth}) as vat_out`
          .execute(tx)
          .then((x) => x.rows[0]!);
        const byCategory = await sql<{ category: string; amount: number }>`
          select l.category, sum(l.net_amount)::int as amount
          from public.business_document_lines l join public.business_documents d on d.id = l.document_id
          where d.kind = 'incoming_invoice' and ${docMonth}
          group by 1 order by 2 desc`
          .execute(tx)
          .then((x) => x.rows);
        const open = await sql<{ kind: string; count: number; amount: number; overdue: number }>`
          select kind, count(*)::int as count, coalesce(sum(total_amount), 0)::int as amount,
                 count(*) filter (where due_on < public.club_today())::int as overdue
          from public.business_documents where status = 'unpaid' group by kind`
          .execute(tx)
          .then((x) => x.rows);
        const pick = (k: string) =>
          open.find((o) => o.kind === k) ?? { count: 0, amount: 0, overdue: 0 };
        const incomeTotal = r.memberships + r.services + r.cafe + r.invoices;
        const costTotal = byCategory.reduce((s, c) => s + c.amount, 0) + r.shares;
        const unpaid = pick('incoming_invoice');
        const receivable = pick('outgoing_invoice');
        return {
          month,
          currency: 'RSD',
          income: {
            memberships: r.memberships,
            services: r.services,
            cafe: r.cafe,
            invoices: r.invoices,
            total: incomeTotal,
          },
          costs: { byCategory, trainerShares: r.shares, total: costTotal },
          vat: { input: r.vat_in, output: r.vat_out, balance: r.vat_out - r.vat_in },
          result: incomeTotal - costTotal,
          unpaidInvoices: { count: unpaid.count, amount: unpaid.amount, overdue: unpaid.overdue },
          receivables: { count: receivable.count, amount: receivable.amount },
        };
      }),
  };
}
