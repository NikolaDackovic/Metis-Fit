import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tableOrderLimiter } from '../src/modules/cafe/cafe.routes';
import { deliverFiscal, signPayload, type PosSale, type PosSender } from '../src/modules/cafe/pos';
import { createHarness, type Harness, type TestUser } from './harness';

let h: Harness;
let manager: TestUser;
let reception: TestUser;
let coffee: string;
let shake: string;
let tableCode: string;
let tableId: string;

beforeAll(async () => {
  h = await createHarness();
  manager = await h.user({ role: 'manager', aal: 'aal2' });
  reception = await h.user({ role: 'reception' });
  const menu = await h.http.get('/v1/admin/cafe/menu?locale=en').set(manager.auth);
  const items = menu.body.data.flatMap(
    (c: { items: Array<{ id: string; trackStock: boolean }> }) => c.items,
  );
  coffee = items.find((i: { trackStock: boolean }) => !i.trackStock).id;
  shake = items.find(
    (i: { trackStock: boolean; name: string }) => i.trackStock && /shake/i.test(i.name),
  ).id;
  const tables = await h.http.get('/v1/admin/cafe/tables').set(reception.auth);
  tableCode = tables.body.data[0].code;
  tableId = tables.body.data[0].id;
});
afterAll(async () => h?.close());

describe('café', () => {
  it('the bar sees who ordered: a guest name, or the member when ordering from the app at a table', async () => {
    tableOrderLimiter.reset();
    const guest = await h.http.post('/v1/public/cafe/orders').send({
      tableCode,
      guestName: '  Marko  ',
      items: [{ itemId: coffee, qty: 1 }],
    });
    expect(guest.body.data).toMatchObject({ guestName: 'Marko', memberName: null });
    const m = await h.user({ member: true });
    const mine = await h.http
      .post('/v1/me/cafe/orders')
      .set(m.auth)
      .send({ tableCode, items: [{ itemId: coffee, qty: 1 }] });
    expect(mine.status).toBe(201);
    expect(mine.body.data.memberName).toEqual(expect.any(String));
    expect(mine.body.data).toMatchObject({ guestName: null, tableLabel: expect.any(String) });
    const open = await h.http.get('/v1/admin/cafe/orders?view=open').set(reception.auth);
    const names = open.body.data.map(
      (o: { guestName: string | null; memberName: string | null }) => o.memberName ?? o.guestName,
    );
    expect(names).toEqual(expect.arrayContaining(['Marko', mine.body.data.memberName]));
  });

  it('public menu shows available items; a table QR identifies the table', async () => {
    const menu = await h.http.get(`/v1/public/cafe/menu?locale=en&table=${tableCode}`);
    expect(menu.status).toBe(200);
    expect(menu.body.data.table).toMatchObject({ id: tableId });
    expect(menu.body.data.categories.length).toBeGreaterThan(0);
    expect(menu.body.data.categories[0].items[0].sku).toBeNull(); // staff-only field hidden
    expect((await h.http.get('/v1/public/cafe/menu?table=wrongcode123')).status).toBe(404);
  });

  it('a guest orders from the table, follows the order with its token, the bar serves and charges it', async () => {
    tableOrderLimiter.reset();
    const before = await stockOf(shake);
    const placed = await h.http.post('/v1/public/cafe/orders').send({
      tableCode,
      items: [
        { itemId: shake, qty: 2 },
        { itemId: coffee, qty: 1 },
      ],
      note: 'Bez šećera',
    });
    expect(placed.status).toBe(201);
    const o = placed.body.data;
    expect(o).toMatchObject({
      source: 'table_qr',
      status: 'new',
      paymentStatus: 'unpaid',
      tableLabel: expect.any(String),
    });
    expect(o.totalAmount).toBe(
      o.items.reduce((s: number, i: { lineTotal: number }) => s + i.lineTotal, 0),
    );
    expect(await stockOf(shake)).toBe(before - 2);

    expect(
      (await h.http.get(`/v1/public/cafe/orders/${o.id}?token=${'x'.repeat(32)}`)).status,
    ).toBe(404);
    const followed = await h.http.get(`/v1/public/cafe/orders/${o.id}?token=${o.guestToken}`);
    expect(followed.body.data.guestToken).toBeUndefined();

    const board = await h.http.get('/v1/admin/cafe/orders').set(reception.auth);
    expect(board.body.data.map((x: { id: string }) => x.id)).toContain(o.id);
    await h.http
      .post(`/v1/admin/cafe/orders/${o.id}/status`)
      .set(reception.auth)
      .send({ status: 'ready' })
      .expect(200);
    const paid = await h.http
      .post(`/v1/admin/cafe/orders/${o.id}/pay`)
      .set(reception.auth)
      .send({ method: 'card' });
    expect(paid.body.data).toMatchObject({
      paymentStatus: 'paid',
      paymentMethod: 'card',
      fiscalStatus: 'none',
    });
    expect(
      (
        await h.http
          .post(`/v1/admin/cafe/orders/${o.id}/pay`)
          .set(reception.auth)
          .send({ method: 'cash' })
      ).status,
    ).toBe(409);
    expect(
      (
        await h.http
          .post(`/v1/admin/cafe/orders/${o.id}/cancel`)
          .set(reception.auth)
          .send({ reason: 'Greška' })
      ).body.message,
    ).toBe('errors.cafe.paid_not_cancellable');
  });

  it('never sells more than in stock; cancelling gives stock back', async () => {
    const qty = await stockOf(shake);
    const tooMany = await h.http
      .post('/v1/public/cafe/orders')
      .send({ tableCode, items: [{ itemId: shake, qty: Math.min(50, qty + 1) }] });
    if (qty < 50) expect(tooMany.body.message).toBe('errors.cafe.out_of_stock');
    const m = await h.user({ member: true });
    const mine = await h.http
      .post('/v1/me/cafe/orders')
      .set(m.auth)
      .send({ items: [{ itemId: shake, qty: 1 }] });
    expect(mine.status).toBe(201);
    expect(mine.body.data).toMatchObject({ source: 'app', tableLabel: null });
    expect(await stockOf(shake)).toBe(qty - 1);
    await h.http
      .post(`/v1/admin/cafe/orders/${mine.body.data.id}/cancel`)
      .set(reception.auth)
      .send({ reason: 'Predomislio se' })
      .expect(200);
    expect(await stockOf(shake)).toBe(qty);
    const list = await h.http.get('/v1/me/cafe/orders').set(m.auth);
    expect(list.body.data[0]).toMatchObject({ status: 'cancelled' });
  });

  it('menu, stock and settings are for managers; reception can restock but not change prices', async () => {
    const r = await h.http
      .put(`/v1/admin/cafe/items/${coffee}`)
      .set(reception.auth)
      .send({
        categoryId: '00000000-0000-0000-0000-000000000000',
        translations: { sr: { name: 'X' } },
        priceAmount: 1,
      });
    expect(r.status).toBe(403);
    const restock = await h.http
      .post(`/v1/admin/cafe/items/${shake}/stock`)
      .set(reception.auth)
      .send({ delta: 10, reason: 'restock' });
    expect(restock.status).toBe(200);
    const neg = await h.http
      .post(`/v1/admin/cafe/items/${shake}/stock`)
      .set(reception.auth)
      .send({ delta: -100_000, reason: 'waste' });
    expect(neg.body.message).toBe('errors.cafe.stock_negative');
    expect((await h.http.get('/v1/admin/cafe/settings').set(reception.auth)).status).toBe(403);
  });

  it('hands paid orders to the POS webhook, signed, and retries failures', async () => {
    await h.http
      .put('/v1/admin/cafe/settings')
      .set(manager.auth)
      .send({
        enabled: true,
        tableOrdering: true,
        posMode: 'webhook',
        posUrl: 'https://pos.example.test/sale',
      })
      .expect(200);
    const bar = await h.http
      .post('/v1/admin/cafe/orders')
      .set(reception.auth)
      .send({ tableId, items: [{ itemId: coffee, qty: 2 }], payNow: 'cash' });
    expect(bar.body.data).toMatchObject({ paymentStatus: 'paid', fiscalStatus: 'pending' });

    const calls: PosSale[] = [];
    let online = false;
    const sender: PosSender = async (_url, sale) => {
      calls.push(sale);
      return online ? { ok: true, reference: 'R-1' } : { ok: false, error: 'HTTP 503' };
    };
    expect(await deliverFiscal(h.db, sender)).toBe(0);
    let s = await h.http.get('/v1/admin/cafe/settings').set(manager.auth);
    expect(s.body.data).toMatchObject({ failedOrders: 1, posMode: 'webhook' });
    online = true;
    expect(await deliverFiscal(h.db, sender)).toBe(1);
    expect(calls.at(-1)).toMatchObject({
      orderId: bar.body.data.id,
      totalAmount: bar.body.data.totalAmount,
      paymentMethod: 'cash',
    });
    expect(calls.at(-1)!.lines[0]).toMatchObject({ qty: 2 });
    s = await h.http.get('/v1/admin/cafe/settings').set(manager.auth);
    expect(s.body.data.failedOrders).toBe(0);
    expect(signPayload('{"a":1}', 'secret')).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

async function stockOf(id: string) {
  const r = await h.db
    .selectFrom('cafe_items')
    .select('stock_qty')
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return r.stock_qty;
}
