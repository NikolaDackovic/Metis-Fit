import { createHmac } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { DB } from '@grit/database';

/**
 * Adapter to the club's POS / fiscal system. The café never issues fiscal receipts itself:
 * when an order is paid it is handed over here.
 *
 *  - mode 'none'    → nothing is sent (receipt is issued on the club's POS by hand)
 *  - mode 'webhook' → POST JSON to `cafe.pos_url`, signed with HMAC-SHA256 of the raw body in the
 *                     `X-GRIT-Signature: sha256=<hex>` header (secret: env CAFE_POS_SECRET).
 *                     The POS answers 2xx, optionally with `{ "reference": "..." }` (receipt no.).
 *
 * Delivery is at-least-once: pending/failed orders are retried by the scheduler (max 10 tries);
 * the order id is the idempotency key the POS should use.
 */
export interface PosSale {
  orderId: string;
  number: number;
  paidAt: string;
  paymentMethod: string;
  currency: string;
  totalAmount: number;
  lines: Array<{
    sku: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export function signPayload(body: string, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export type PosSender = (
  url: string,
  sale: PosSale,
) => Promise<{ ok: boolean; reference?: string; error?: string }>;

export function createWebhookSender(secret: string | undefined, logger?: Logger): PosSender {
  return async (url, sale) => {
    const body = JSON.stringify({ type: 'cafe.sale', sale });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': sale.orderId,
          ...(secret && { 'x-grit-signature': signPayload(body, secret) }),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const json = (await res.json().catch(() => ({}))) as { reference?: unknown };
      return {
        ok: true,
        reference: typeof json.reference === 'string' ? json.reference.slice(0, 120) : undefined,
      };
    } catch (err) {
      logger?.warn({ err }, 'POS webhook failed');
      return {
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 200) : 'network error',
      };
    }
  };
}

async function saleOf(db: Kysely<DB>, orderId: string): Promise<PosSale | null> {
  const o = await db
    .selectFrom('cafe_orders')
    .select(['id', 'number', 'paid_at', 'payment_method', 'currency', 'total_amount'])
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!o || !o.paid_at) return null;
  const lines = await db
    .selectFrom('cafe_order_items')
    .select(['sku', 'name', 'qty', 'unit_price', 'line_total'])
    .where('order_id', '=', orderId)
    .execute();
  return {
    orderId: o.id,
    number: o.number,
    paidAt: new Date(o.paid_at).toISOString(),
    paymentMethod: o.payment_method ?? 'other',
    currency: o.currency,
    totalAmount: o.total_amount,
    lines: lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unit_price,
      lineTotal: l.line_total,
    })),
  };
}

/** Sends pending / failed fiscal hand-overs (max 10 attempts each). Returns how many succeeded. */
export async function deliverFiscal(
  db: Kysely<DB>,
  send: PosSender,
  onlyOrderId?: string,
): Promise<number> {
  // F12: every gym has its own POS. Orders go only to their gym's POS, never to another's.
  let q = db
    .selectFrom('cafe_orders')
    .select(['id', 'club_id'])
    .where('fiscal_status', 'in', ['pending', 'failed'])
    .where('fiscal_attempts', '<', 10)
    .orderBy('paid_at')
    .limit(50);
  if (onlyOrderId) q = q.where('id', '=', onlyOrderId);
  const orders = await q.execute();
  const config = new Map<string, { mode: string | null; url: string | null }>();
  const configOf = async (clubId: string) => {
    const cached = config.get(clubId);
    if (cached) return cached;
    const cfg = await sql<{ mode: string | null; url: string | null }>`
      select (select value #>> '{}' from public.settings where club_id = ${clubId} and key = 'cafe.pos_mode') as mode,
             (select value #>> '{}' from public.settings where club_id = ${clubId} and key = 'cafe.pos_url') as url`
      .execute(db)
      .then((r) => r.rows[0]!);
    config.set(clubId, cfg);
    return cfg;
  };
  let sent = 0;
  for (const { id, club_id } of orders) {
    const cfg = await configOf(club_id);
    if (cfg.mode !== 'webhook' || !cfg.url) continue;
    const sale = await saleOf(db, id);
    if (!sale) continue;
    const r = await send(cfg.url, sale);
    await db
      .updateTable('cafe_orders')
      .set((eb) => ({
        fiscal_status: r.ok ? 'sent' : 'failed',
        fiscal_ref: r.reference ?? null,
        fiscal_error: r.ok ? null : (r.error ?? 'error'),
        fiscal_attempts: eb('fiscal_attempts', '+', 1),
      }))
      .where('id', '=', id)
      .execute();
    if (r.ok) sent += 1;
  }
  return sent;
}
