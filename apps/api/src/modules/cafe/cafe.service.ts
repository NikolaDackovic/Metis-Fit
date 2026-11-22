import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { sql, type Kysely } from 'kysely';
import type { DB } from '@grit/database';
import type {
  BarOrderBody,
  CafeCategoryBody,
  CafeCategoryDto,
  CafeItemBody,
  CafeItemDto,
  CafeMenuDto,
  CafeOrderDto,
  CafeSettingsBody,
  CafeSettingsDto,
  CafeTableDto,
  PlacedOrderDto,
} from '@grit/validation';
import { withStaffTx, type Tx } from '../../database/tx';
import type { Actor } from '../../middleware/auth';
import { writeAudit } from '../../shared/audit';
import { AppError, notFound } from '../../shared/errors';
import { decodeImage, mediaKey, type MediaStore } from '../../shared/media';
import { memberIdFor } from '../classes/bookings.service';

type Tr = Record<string, { name?: string; description?: string | null }>;
const tr = (t: unknown, locale: string) => {
  const x = (t ?? {}) as Tr;
  return x[locale]?.name ? x[locale]! : locale === 'ar' && x.en?.name ? x.en : (x.sr ?? {});
};
const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());
const tableCode = () =>
  randomBytes(12)
    .toString('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 16)
    .padEnd(12, 'x');

async function settings(tx: Tx) {
  const rows = await tx
    .selectFrom('settings')
    .select(['key', 'value'])
    .where('key', 'like', 'cafe.%')
    .execute();
  const m = new Map(rows.map((r) => [r.key, r.value as unknown]));
  return {
    enabled: m.get('cafe.enabled') !== false,
    tableOrdering: m.get('cafe.table_ordering') !== false,
    posMode: (m.get('cafe.pos_mode') === 'webhook' ? 'webhook' : 'none') as 'none' | 'webhook',
    posUrl: typeof m.get('cafe.pos_url') === 'string' ? (m.get('cafe.pos_url') as string) : null,
  };
}

async function menu(
  tx: Tx,
  media: MediaStore,
  locale: string,
  staff: boolean,
): Promise<CafeCategoryDto[]> {
  let cq = tx.selectFrom('cafe_categories').selectAll().orderBy('sort_order').orderBy('created_at');
  if (!staff) cq = cq.where('is_active', '=', true);
  const cats = await cq.execute();
  let iq = tx.selectFrom('cafe_items').selectAll().orderBy('sort_order').orderBy('created_at');
  if (!staff) iq = iq.where('is_available', '=', true);
  const items = await iq.execute();
  return cats
    .map((c) => ({
      id: c.id,
      name: tr(c.translations, locale).name ?? '-',
      sortOrder: c.sort_order,
      isActive: c.is_active,
      ...(staff && { translations: c.translations as CafeCategoryDto['translations'] }),
      items: items
        .filter((i) => i.category_id === c.id)
        .map((i): CafeItemDto => ({
          id: i.id,
          categoryId: i.category_id,
          name: tr(i.translations, locale).name ?? '-',
          description: tr(i.translations, locale).description ?? null,
          priceAmount: i.price_amount,
          currency: i.currency,
          photoUrl: i.photo_path ? media.url(i.photo_path) : null,
          isAvailable: i.is_available,
          inStock: !i.track_stock || i.stock_qty > 0,
          trackStock: i.track_stock,
          stockQty: staff || i.track_stock ? i.stock_qty : null,
          lowStockAt: i.low_stock_at,
          sku: staff ? i.sku : null,
          sortOrder: i.sort_order,
          ...(staff && { translations: i.translations as CafeItemDto['translations'] }),
        })),
    }))
    .filter((c) => staff || c.items.length > 0);
}

async function loadOrders(
  tx: Tx,
  where: { ids?: string[]; memberId?: string; view?: 'open' | 'today' },
) {
  let q = tx
    .selectFrom('cafe_orders as o')
    .leftJoin('cafe_tables as t', 't.id', 'o.table_id')
    .leftJoin('members as m', 'm.id', 'o.member_id')
    .selectAll('o')
    .select([
      't.label as table_label',
      sql<string | null>`m.first_name || ' ' || m.last_name`.as('member_name'),
    ])
    .orderBy('o.created_at', 'desc');
  if (where.ids)
    q = q.where(
      'o.id',
      'in',
      where.ids.length ? where.ids : ['00000000-0000-0000-0000-000000000000'],
    );
  if (where.memberId) q = q.where('o.member_id', '=', where.memberId).limit(30);
  if (where.view === 'open') q = q.where('o.status', 'not in', ['served', 'cancelled']);
  if (where.view === 'today')
    q = q.where(
      sql<boolean>`(o.created_at at time zone 'Europe/Belgrade')::date = public.club_today()`,
    );
  const rows = await q.execute();
  const lines = rows.length
    ? await tx
        .selectFrom('cafe_order_items')
        .selectAll()
        .where(
          'order_id',
          'in',
          rows.map((r) => r.id),
        )
        .execute()
    : [];
  return rows.map((o): CafeOrderDto & { guestToken: string } => ({
    id: o.id,
    number: o.number,
    source: o.source as CafeOrderDto['source'],
    tableLabel: o.table_label,
    memberName: o.member_name,
    guestName: o.guest_name,
    status: o.status as CafeOrderDto['status'],
    paymentStatus: o.payment_status as CafeOrderDto['paymentStatus'],
    paymentMethod: o.payment_method as CafeOrderDto['paymentMethod'],
    totalAmount: o.total_amount,
    currency: o.currency,
    note: o.note,
    fiscalStatus: o.fiscal_status as CafeOrderDto['fiscalStatus'],
    fiscalError: o.fiscal_error,
    items: lines
      .filter((l) => l.order_id === o.id)
      .map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unit_price, lineTotal: l.line_total })),
    createdAt: iso(o.created_at)!,
    paidAt: iso(o.paid_at),
    guestToken: o.guest_token,
  }));
}
const strip = ({ guestToken: _g, ...o }: CafeOrderDto & { guestToken: string }): CafeOrderDto => o;

async function tableByCode(tx: Tx, code: string) {
  const t = await tx
    .selectFrom('cafe_tables')
    .select(['id', 'label'])
    .where('code', '=', code)
    .where('is_active', '=', true)
    .executeTakeFirst();
  if (!t) throw new AppError('NOT_FOUND', 'errors.cafe.table_not_found');
  return t;
}

/** Locks the menu rows, checks availability and stock, writes the order and takes the stock. */
async function place(
  tx: Tx,
  locale: string,
  o: {
    source: 'table_qr' | 'app' | 'bar';
    tableId: string | null;
    memberId: string | null;
    items: Array<{ itemId: string; qty: number }>;
    note: string | null;
    createdBy: string | null;
    guestName?: string | null;
  },
) {
  const cfg = await settings(tx);
  if (!cfg.enabled) throw new AppError('BUSINESS_RULE', 'errors.cafe.closed');
  const wanted = new Map<string, number>();
  for (const l of o.items) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + l.qty);
  const rows = await tx
    .selectFrom('cafe_items as i')
    .innerJoin('cafe_categories as c', 'c.id', 'i.category_id')
    .select([
      'i.id',
      'i.translations',
      'i.price_amount',
      'i.currency',
      'i.is_available',
      'i.track_stock',
      'i.stock_qty',
      'i.sku',
      'c.is_active',
    ])
    .where('i.id', 'in', [...wanted.keys()])
    .forUpdate('i')
    .orderBy('i.id')
    .execute();
  if (rows.length !== wanted.size)
    throw new AppError('BUSINESS_RULE', 'errors.cafe.item_unavailable');
  for (const r of rows) {
    if (!r.is_available || !r.is_active)
      throw new AppError('BUSINESS_RULE', 'errors.cafe.item_unavailable');
    if (r.track_stock && r.stock_qty < wanted.get(r.id)!)
      throw new AppError('BUSINESS_RULE', 'errors.cafe.out_of_stock', [
        { path: 'items', message: tr(r.translations, locale).name ?? '' },
      ]);
  }
  const total = rows.reduce((s, r) => s + r.price_amount * wanted.get(r.id)!, 0);
  const { n } = await sql<{ n: number }>`select nextval('public.cafe_order_number_seq')::int as n`
    .execute(tx)
    .then((x) => x.rows[0]!);
  const order = await tx
    .insertInto('cafe_orders')
    .values({
      number: ((n - 1) % 999) + 1,
      source: o.source,
      table_id: o.tableId,
      member_id: o.memberId,
      guest_name: o.memberId ? null : (o.guestName ?? null),
      total_amount: total,
      currency: rows[0]!.currency,
      note: o.note,
      guest_token: randomBytes(24).toString('base64url'),
      created_by: o.createdBy,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await tx
    .insertInto('cafe_order_items')
    .values(
      rows.map((r) => ({
        order_id: order.id,
        item_id: r.id,
        name: tr(r.translations, 'sr').name ?? '-', // receipts and the POS use the Serbian name
        sku: r.sku,
        unit_price: r.price_amount,
        qty: wanted.get(r.id)!,
        line_total: r.price_amount * wanted.get(r.id)!,
      })),
    )
    .execute();
  for (const r of rows.filter((x) => x.track_stock)) {
    const qty = wanted.get(r.id)!;
    await tx
      .updateTable('cafe_items')
      .set((eb) => ({ stock_qty: eb('stock_qty', '-', qty) }))
      .where('id', '=', r.id)
      .execute();
    await tx
      .insertInto('cafe_stock_movements')
      .values({
        item_id: r.id,
        delta: -qty,
        reason: 'sale',
        order_id: order.id,
        created_by: o.createdBy,
      })
      .execute();
  }
  return order.id;
}

const itemValues = (b: CafeItemBody) => ({
  category_id: b.categoryId,
  translations: JSON.stringify(b.translations),
  price_amount: b.priceAmount,
  is_available: b.isAvailable,
  track_stock: b.trackStock,
  low_stock_at: b.lowStockAt,
  sku: b.sku ?? null,
  sort_order: b.sortOrder,
});

export function createCafeService(db: Kysely<DB>, media: MediaStore, posSecretConfigured = false) {
  const staffMenu = (tx: Tx, locale: string) => menu(tx, media, locale, true);
  return {
    // ── Public / members ──────────────────────────────────────────────────────
    publicMenu: (locale: string, code?: string) =>
      withStaffTx(db, async (tx): Promise<CafeMenuDto> => {
        const cfg = await settings(tx);
        const table = code ? await tableByCode(tx, code) : null;
        return {
          enabled: cfg.enabled,
          tableOrdering: cfg.tableOrdering,
          table,
          categories: cfg.enabled ? await menu(tx, media, locale, false) : [],
        };
      }),
    tableOrder: (
      locale: string,
      b: {
        tableCode: string;
        items: Array<{ itemId: string; qty: number }>;
        note?: string | null;
        guestName?: string | null;
      },
    ) =>
      withStaffTx(db, async (tx): Promise<PlacedOrderDto> => {
        const cfg = await settings(tx);
        if (!cfg.tableOrdering)
          throw new AppError('BUSINESS_RULE', 'errors.cafe.table_ordering_off');
        const table = await tableByCode(tx, b.tableCode);
        const id = await place(tx, locale, {
          source: 'table_qr',
          tableId: table.id,
          memberId: null,
          items: b.items,
          note: b.note ?? null,
          createdBy: null,
          guestName: b.guestName ?? null,
        });
        return (await loadOrders(tx, { ids: [id] }))[0]!;
      }),
    guestOrder: (id: string, token: string) =>
      withStaffTx(db, async (tx) => {
        const [o] = await loadOrders(tx, { ids: [id] });
        // Same answer for "no such order" and "wrong token": nothing to probe.
        if (!o || o.guestToken.length !== token.length || o.guestToken !== token)
          throw notFound('cafe_order');
        return strip(o);
      }),
    memberOrder: (
      actor: Actor,
      locale: string,
      b: {
        tableCode?: string | null;
        items: Array<{ itemId: string; qty: number }>;
        note?: string | null;
      },
    ) =>
      withStaffTx(db, async (tx): Promise<PlacedOrderDto> => {
        const memberId = await memberIdFor(tx, actor);
        const table = b.tableCode ? await tableByCode(tx, b.tableCode) : null;
        const id = await place(tx, locale, {
          source: 'app',
          tableId: table?.id ?? null,
          memberId,
          items: b.items,
          note: b.note ?? null,
          createdBy: actor.userId,
        });
        return (await loadOrders(tx, { ids: [id] }))[0]!;
      }),
    myOrders: (actor: Actor) =>
      withStaffTx(db, async (tx) =>
        (await loadOrders(tx, { memberId: await memberIdFor(tx, actor) })).map(strip),
      ),

    // ── Bar ───────────────────────────────────────────────────────────────────
    orders: (view: 'open' | 'today') =>
      withStaffTx(db, async (tx) => (await loadOrders(tx, { view })).map(strip)),
    barOrder: (actor: Actor, req: Request, locale: string, b: BarOrderBody) =>
      withStaffTx(db, async (tx) => {
        const id = await place(tx, locale, {
          source: 'bar',
          tableId: b.tableId ?? null,
          memberId: b.memberId ?? null,
          items: b.items,
          note: b.note ?? null,
          createdBy: actor.userId,
        });
        if (b.payNow) await pay(tx, actor, req, id, b.payNow);
        return strip((await loadOrders(tx, { ids: [id] }))[0]!);
      }),
    setStatus: (actor: Actor, id: string, status: 'preparing' | 'ready' | 'served') =>
      withStaffTx(db, async (tx) => {
        const o = await tx
          .selectFrom('cafe_orders')
          .select('status')
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!o) throw notFound('cafe_order');
        if (o.status === 'cancelled' || o.status === 'served')
          throw new AppError('CONFLICT', 'errors.cafe.order_closed');
        await tx.updateTable('cafe_orders').set({ status }).where('id', '=', id).execute();
        return strip((await loadOrders(tx, { ids: [id] }))[0]!);
      }),
    pay: (actor: Actor, req: Request, id: string, method: string) =>
      withStaffTx(db, async (tx) => {
        await pay(tx, actor, req, id, method);
        return strip((await loadOrders(tx, { ids: [id] }))[0]!);
      }),
    cancel: (actor: Actor, req: Request, id: string, reason: string) =>
      withStaffTx(db, async (tx) => {
        const o = await tx
          .selectFrom('cafe_orders')
          .select(['status', 'payment_status'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!o) throw notFound('cafe_order');
        if (o.status === 'cancelled') throw new AppError('CONFLICT', 'errors.cafe.order_closed');
        if (o.payment_status === 'paid')
          throw new AppError('BUSINESS_RULE', 'errors.cafe.paid_not_cancellable');
        await tx
          .updateTable('cafe_orders')
          .set({ status: 'cancelled', cancelled_reason: reason })
          .where('id', '=', id)
          .execute();
        // Give the stock back.
        const sold = await tx
          .selectFrom('cafe_stock_movements')
          .select(['item_id', 'delta'])
          .where('order_id', '=', id)
          .where('reason', '=', 'sale')
          .execute();
        for (const s of sold) {
          await tx
            .updateTable('cafe_items')
            .set((eb) => ({ stock_qty: eb('stock_qty', '-', s.delta) }))
            .where('id', '=', s.item_id)
            .execute();
          await tx
            .insertInto('cafe_stock_movements')
            .values({
              item_id: s.item_id,
              delta: -s.delta,
              reason: 'sale_cancel',
              order_id: id,
              created_by: actor.userId,
            })
            .execute();
        }
        await writeAudit(tx, actor, req, {
          action: 'cafe_order.cancel',
          entityType: 'cafe_order',
          entityId: id,
          diff: { after: { reason } },
        });
        return strip((await loadOrders(tx, { ids: [id] }))[0]!);
      }),
    retryFiscal: (id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('cafe_orders')
          .set({ fiscal_status: 'pending', fiscal_attempts: 0, fiscal_error: null })
          .where('id', '=', id)
          .where('fiscal_status', 'in', ['failed', 'pending'])
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows))
          throw new AppError('BUSINESS_RULE', 'errors.cafe.nothing_to_retry');
        return { ok: true as const };
      }),

    // ── Menu management ──────────────────────────────────────────────────────
    staffMenu: (locale: string) => withStaffTx(db, (tx) => staffMenu(tx, locale)),
    saveCategory: (actor: Actor, req: Request, locale: string, b: CafeCategoryBody, id?: string) =>
      withStaffTx(db, async (tx) => {
        const v = {
          translations: JSON.stringify(b.translations),
          sort_order: b.sortOrder,
          is_active: b.isActive,
        };
        if (id) {
          const r = await tx
            .updateTable('cafe_categories')
            .set(v)
            .where('id', '=', id)
            .executeTakeFirst();
          if (!Number(r.numUpdatedRows)) throw notFound('cafe_category');
        } else await tx.insertInto('cafe_categories').values(v).execute();
        await writeAudit(tx, actor, req, {
          action: id ? 'cafe_category.update' : 'cafe_category.create',
          entityType: 'cafe_category',
          entityId: id ?? null,
          diff: null,
        });
        return staffMenu(tx, locale);
      }),
    saveItem: (actor: Actor, req: Request, locale: string, b: CafeItemBody, id?: string) =>
      withStaffTx(db, async (tx) => {
        const cat = await tx
          .selectFrom('cafe_categories')
          .select('id')
          .where('id', '=', b.categoryId)
          .executeTakeFirst();
        if (!cat) throw notFound('cafe_category');
        let itemId = id;
        if (id) {
          const before = await tx
            .selectFrom('cafe_items')
            .select('price_amount')
            .where('id', '=', id)
            .executeTakeFirst();
          if (!before) throw notFound('cafe_item');
          await tx.updateTable('cafe_items').set(itemValues(b)).where('id', '=', id).execute();
          await writeAudit(tx, actor, req, {
            action: 'cafe_item.update',
            entityType: 'cafe_item',
            entityId: id,
            diff: {
              before: { priceAmount: before.price_amount },
              after: { priceAmount: b.priceAmount },
            },
          });
        } else {
          const r = await tx
            .insertInto('cafe_items')
            .values(itemValues(b))
            .returning('id')
            .executeTakeFirstOrThrow();
          itemId = r.id;
          await writeAudit(tx, actor, req, {
            action: 'cafe_item.create',
            entityType: 'cafe_item',
            entityId: itemId,
            diff: { after: { priceAmount: b.priceAmount } },
          });
        }
        return staffMenu(tx, locale);
      }),
    itemPhoto: (actor: Actor, req: Request, locale: string, id: string, image: string | null) =>
      withStaffTx(db, async (tx) => {
        const item = await tx
          .selectFrom('cafe_items')
          .select('photo_path')
          .where('id', '=', id)
          .executeTakeFirst();
        if (!item) throw notFound('cafe_item');
        let next: string | null = null;
        if (image) {
          const img = decodeImage(image);
          next = mediaKey('cafe', id, img.ext);
          await media.put(next, img.data, img.type);
        }
        await tx.updateTable('cafe_items').set({ photo_path: next }).where('id', '=', id).execute();
        if (item.photo_path) await media.remove(item.photo_path).catch(() => undefined);
        await writeAudit(tx, actor, req, {
          action: 'cafe_item.photo',
          entityType: 'cafe_item',
          entityId: id,
          diff: null,
        });
        return staffMenu(tx, locale);
      }),
    adjustStock: (
      actor: Actor,
      req: Request,
      locale: string,
      id: string,
      delta: number,
      reason: string,
      note: string | null,
    ) =>
      withStaffTx(db, async (tx) => {
        const item = await tx
          .selectFrom('cafe_items')
          .select(['stock_qty', 'track_stock'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst();
        if (!item) throw notFound('cafe_item');
        if (item.stock_qty + delta < 0)
          throw new AppError('BUSINESS_RULE', 'errors.cafe.stock_negative');
        await tx
          .updateTable('cafe_items')
          .set({ stock_qty: item.stock_qty + delta, track_stock: true })
          .where('id', '=', id)
          .execute();
        await tx
          .insertInto('cafe_stock_movements')
          .values({ item_id: id, delta, reason, note, created_by: actor.userId })
          .execute();
        await writeAudit(tx, actor, req, {
          action: 'cafe_item.stock',
          entityType: 'cafe_item',
          entityId: id,
          diff: { after: { delta, reason } },
        });
        return staffMenu(tx, locale);
      }),

    // ── Tables ────────────────────────────────────────────────────────────────
    tables: () =>
      withStaffTx(db, async (tx): Promise<CafeTableDto[]> =>
        (
          await tx
            .selectFrom('cafe_tables')
            .selectAll()
            .orderBy('sort_order')
            .orderBy('label')
            .execute()
        ).map((t) => ({
          id: t.id,
          label: t.label,
          code: t.code,
          isActive: t.is_active,
          sortOrder: t.sort_order,
        })),
      ),
    saveTable: (
      actor: Actor,
      req: Request,
      b: { label: string; isActive: boolean; sortOrder: number },
      id?: string,
    ) =>
      withStaffTx(db, async (tx) => {
        const v = { label: b.label, is_active: b.isActive, sort_order: b.sortOrder };
        if (id) {
          const r = await tx
            .updateTable('cafe_tables')
            .set(v)
            .where('id', '=', id)
            .executeTakeFirst();
          if (!Number(r.numUpdatedRows)) throw notFound('cafe_table');
        } else
          await tx
            .insertInto('cafe_tables')
            .values({ ...v, code: tableCode() })
            .execute();
        await writeAudit(tx, actor, req, {
          action: 'cafe_table.save',
          entityType: 'cafe_table',
          entityId: id ?? null,
          diff: { after: { label: b.label } },
        });
        return { ok: true as const };
      }),
    /** New QR code for a table (the old printed one stops working). */
    regenerateTable: (actor: Actor, req: Request, id: string) =>
      withStaffTx(db, async (tx) => {
        const r = await tx
          .updateTable('cafe_tables')
          .set({ code: tableCode() })
          .where('id', '=', id)
          .executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw notFound('cafe_table');
        await writeAudit(tx, actor, req, {
          action: 'cafe_table.regenerate',
          entityType: 'cafe_table',
          entityId: id,
          diff: null,
        });
        return { ok: true as const };
      }),

    // ── Settings ──────────────────────────────────────────────────────────────
    settings: () =>
      withStaffTx(db, async (tx): Promise<CafeSettingsDto> => {
        const s = await settings(tx);
        const counts = await sql<{ failed: number; pending: number }>`
          select count(*) filter (where fiscal_status = 'failed')::int as failed,
                 count(*) filter (where fiscal_status = 'pending')::int as pending
          from public.cafe_orders`
          .execute(tx)
          .then((r) => r.rows[0]!);
        return {
          ...s,
          secretConfigured: posSecretConfigured,
          failedOrders: counts.failed,
          pendingOrders: counts.pending,
        };
      }),
    saveSettings: (actor: Actor, req: Request, b: CafeSettingsBody) =>
      withStaffTx(db, async (tx) => {
        if (b.posMode === 'webhook' && !b.posUrl)
          throw new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
            { path: 'posUrl', message: 'validation.required' },
          ]);
        const put = async (key: string, value: unknown) => {
          const v = JSON.stringify(value ?? null);
          await tx
            .insertInto('settings')
            .values({ key, value: v, updated_by: actor.userId })
            .onConflict((oc) =>
              oc.columns(['club_id', 'key']).doUpdateSet({ value: v, updated_by: actor.userId }),
            )
            .execute();
        };
        await put('cafe.enabled', b.enabled);
        await put('cafe.table_ordering', b.tableOrdering);
        await put('cafe.pos_mode', b.posMode);
        await put('cafe.pos_url', b.posUrl ?? null);
        await writeAudit(tx, actor, req, {
          action: 'cafe.settings',
          entityType: 'settings',
          entityId: null,
          diff: { after: { posMode: b.posMode, enabled: b.enabled } },
        });
        return { ok: true as const };
      }),
  };
}

async function pay(tx: Tx, actor: Actor, req: Request, id: string, method: string) {
  const o = await tx
    .selectFrom('cafe_orders')
    .select(['status', 'payment_status', 'total_amount'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst();
  if (!o) throw notFound('cafe_order');
  if (o.status === 'cancelled') throw new AppError('CONFLICT', 'errors.cafe.order_closed');
  if (o.payment_status === 'paid') throw new AppError('CONFLICT', 'errors.cafe.already_paid');
  const cfg = await settings(tx);
  await tx
    .updateTable('cafe_orders')
    .set({
      payment_status: 'paid',
      payment_method: method,
      paid_at: new Date(),
      paid_by: actor.userId,
      fiscal_status: cfg.posMode === 'webhook' ? 'pending' : 'none',
    })
    .where('id', '=', id)
    .execute();
  await writeAudit(tx, actor, req, {
    action: 'cafe_order.pay',
    entityType: 'cafe_order',
    entityId: id,
    diff: { after: { method, amount: o.total_amount } },
  });
}
