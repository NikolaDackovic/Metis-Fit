import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let today: string;
let water: { id: string; stockQty: number };

const stock = async (id: string) =>
  (
    await h.db
      .selectFrom('cafe_items')
      .select('stock_qty')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  ).stock_qty;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  today = await sql<{ d: string }>`select public.club_today()::text as d`
    .execute(h.db)
    .then((r) => r.rows[0]!.d);
  const menu = await h.http.get('/v1/admin/cafe/menu').set(manager.auth);
  water = menu.body.data
    .flatMap(
      (c: { items: Array<{ id: string; trackStock: boolean; stockQty: number }> }) => c.items,
    )
    .find((i: { trackStock: boolean }) => i.trackStock);
});
afterAll(async () => h?.close());

describe('partners (komitenti)', () => {
  it('needs a role, validates PIB, refuses a duplicate PIB, front desk has no access', async () => {
    expect((await h.http.get('/v1/admin/partners').set(reception.auth)).status).toBe(403);
    const noRole = await h.http
      .post('/v1/admin/partners')
      .set(manager.auth)
      .send({ name: 'X', isSupplier: false, isCustomer: false });
    expect(noRole.status).toBe(400);
    const badPib = await h.http
      .post('/v1/admin/partners')
      .set(manager.auth)
      .send({ name: 'X', taxId: '123' });
    expect(badPib.status).toBe(400);
    const ok = await h.http
      .post('/v1/admin/partners')
      .set(manager.auth)
      .send({ name: 'Ikarbus', taxId: '112 312 662', isSupplier: true, isCustomer: true });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ taxId: '112312662', isSupplier: true, isCustomer: true });
    const dup = await h.http
      .post('/v1/admin/partners')
      .set(manager.auth)
      .send({ name: 'Drugi', taxId: '112312662' });
    expect(dup.body.message).toBe('errors.partner.tax_id_taken');
  });
});

describe('documents', () => {
  it('incoming invoice with VAT raises stock, outgoing lowers it, storno undoes, card and finance add up', async () => {
    const supplier = (
      await h.http
        .post('/v1/admin/partners')
        .set(manager.auth)
        .send({ name: 'Veletrgovina', taxId: '100200300' })
    ).body.data;
    const customer = (
      await h.http
        .post('/v1/admin/partners')
        .set(manager.auth)
        .send({ name: 'Firma kupac', taxId: '100200301', isSupplier: false, isCustomer: true })
    ).body.data;
    const before = await stock(water.id);

    // 24 × 54,00 RSD net, 10% discount on the first line, VAT 20%.
    const inv = await h.http
      .post('/v1/admin/documents')
      .set(manager.auth)
      .send({
        kind: 'incoming_invoice',
        partnerId: supplier.id,
        number: 'F-001',
        turnoverOn: today,
        dueOn: today,
        lines: [
          {
            cafeItemId: water.id,
            name: 'Voda 0,5 l',
            unit: 'kom',
            qty: 24,
            unitPrice: 5_400,
            discountPct: 10,
            vatRate: 20,
          },
          {
            category: 'utilities',
            name: 'Struja',
            unit: 'kom',
            qty: 1,
            unitPrice: 1_000_000,
            vatRate: 20,
          },
        ],
      });
    expect(inv.status).toBe(201);
    // line 1: 129 600 gross, 12 960 discount, 116 640 net, 23 328 VAT
    expect(inv.body.data).toMatchObject({
      discountAmount: 12_960,
      netAmount: 116_640 + 1_000_000,
      vatAmount: 23_328 + 200_000,
      totalAmount: 116_640 + 23_328 + 1_200_000,
      status: 'unpaid',
      partnerName: 'Veletrgovina',
    });
    expect(await stock(water.id)).toBe(before + 24);

    const dup = await h.http
      .post('/v1/admin/documents')
      .set(manager.auth)
      .send({
        kind: 'incoming_invoice',
        partnerId: supplier.id,
        number: 'F-001',
        turnoverOn: today,
        lines: [{ name: 'X', qty: 1, unitPrice: 1 }],
      });
    expect(dup.body.message).toBe('errors.document.duplicate');
    const wrongRole = await h.http
      .post('/v1/admin/documents')
      .set(manager.auth)
      .send({
        kind: 'outgoing_invoice',
        partnerId: supplier.id,
        number: 'I-1',
        turnoverOn: today,
        lines: [{ name: 'X', qty: 1, unitPrice: 1 }],
      });
    expect(wrongRole.body.message).toBe('errors.document.partner_not_customer');

    // Goods out: cannot sell more than is in stock.
    const tooMuch = await h.http
      .post('/v1/admin/documents')
      .set(manager.auth)
      .send({
        kind: 'outgoing_invoice',
        partnerId: customer.id,
        number: 'I-1',
        turnoverOn: today,
        lines: [{ cafeItemId: water.id, name: 'Voda', qty: 100_000, unitPrice: 8_000 }],
      });
    expect(tooMuch.body.message).toBe('errors.document.not_enough_stock');
    const out = await h.http
      .post('/v1/admin/documents')
      .set(manager.auth)
      .send({
        kind: 'outgoing_invoice',
        partnerId: customer.id,
        number: 'I-1',
        turnoverOn: today,
        lines: [{ cafeItemId: water.id, name: 'Voda', qty: 4, unitPrice: 8_000, vatRate: 20 }],
      });
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({
      netAmount: 32_000,
      vatAmount: 6_400,
      totalAmount: 38_400,
    });
    expect(await stock(water.id)).toBe(before + 20);

    const fin = await h.http.get(`/v1/admin/finance?month=${today.slice(0, 7)}`).set(manager.auth);
    expect(fin.body.data.costs.byCategory).toEqual(
      expect.arrayContaining([
        { category: 'utilities', amount: 1_000_000 },
        { category: 'goods', amount: 116_640 },
      ]),
    );
    expect(fin.body.data.income.invoices).toBe(32_000);
    expect(fin.body.data.vat).toEqual({ input: 223_328, output: 6_400, balance: 6_400 - 223_328 });
    expect(fin.body.data.unpaidInvoices).toMatchObject({ count: 1, amount: 1_339_968 });
    expect(fin.body.data.receivables).toEqual({ count: 1, amount: 38_400 });

    const card = await h.http
      .get(`/v1/admin/partners/${supplier.id}/card?from=${today.slice(0, 8)}01&to=${today}`)
      .set(manager.auth);
    expect(card.body.data.rows).toHaveLength(1);
    expect(card.body.data.totals).toMatchObject({
      incoming: 1_339_968,
      incomingUnpaid: 1_339_968,
      balance: -1_339_968,
    });

    const paid = await h.http
      .post(`/v1/admin/documents/${inv.body.data.id}/pay`)
      .set(manager.auth)
      .send({ paidOn: today, method: 'bank_transfer' });
    expect(paid.body.data.status).toBe('paid');
    const card2 = await h.http
      .get(`/v1/admin/partners/${supplier.id}/card?from=${today}&to=${today}`)
      .set(manager.auth);
    expect(card2.body.data.totals.balance).toBe(0);

    // Storno of the outgoing invoice returns the 4 bottles; then the incoming one takes 24 out.
    await h.http
      .post(`/v1/admin/documents/${out.body.data.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Greška' });
    expect(await stock(water.id)).toBe(before + 24);
    const voided = await h.http
      .post(`/v1/admin/documents/${inv.body.data.id}/void`)
      .set(manager.auth)
      .send({ reason: 'Pogrešan unos' });
    expect(voided.body.data.status).toBe('void');
    expect(await stock(water.id)).toBe(before);
  });
});

describe('stock count (popis)', () => {
  it('books the difference between counted and system quantity', async () => {
    const system = await stock(water.id);
    const r = await h.http
      .post('/v1/admin/stock-counts')
      .set(manager.auth)
      .send({ countedOn: today, lines: [{ cafeItemId: water.id, countedQty: system - 3 }] });
    expect(r.status).toBe(201);
    expect(r.body.data[0].lines[0]).toMatchObject({
      systemQty: system,
      countedQty: system - 3,
      diff: -3,
    });
    expect(await stock(water.id)).toBe(system - 3);
  });
});
