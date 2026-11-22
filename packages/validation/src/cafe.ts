import { z } from 'zod';
import { uuid } from './common';

/** F9: café menu, stock, tables (QR), orders and the POS / fiscal adapter. */

const LOCALE = z.enum(['sr', 'en', 'ru', 'ar']);
const name = z
  .string()
  .trim()
  .min(1, { error: 'validation.required' })
  .max(80, { error: 'validation.too_long' });
const desc = z.string().trim().max(300, { error: 'validation.too_long' });

export const CAFE_ORDER_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'] as const;
export type CafeOrderStatus = (typeof CAFE_ORDER_STATUSES)[number];
export const CAFE_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export const CAFE_STOCK_REASONS = ['restock', 'adjust', 'waste'] as const;

// ── Menu ──────────────────────────────────────────────────────────────────────
export const cafeCategoryBody = z.object({
  translations: z
    .partialRecord(LOCALE, z.object({ name }))
    .refine((t) => Boolean(t.sr?.name), { error: 'validation.required' }),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
  isActive: z.boolean().default(true),
});
export type CafeCategoryBody = z.infer<typeof cafeCategoryBody>;

export const cafeItemBody = z.object({
  categoryId: uuid,
  translations: z
    .partialRecord(LOCALE, z.object({ name, description: desc.nullable().optional() }))
    .refine((t) => Boolean(t.sr?.name), { error: 'validation.required' }),
  priceAmount: z.number().int().min(0).max(100_000_000),
  isAvailable: z.boolean().default(true),
  trackStock: z.boolean().default(false),
  lowStockAt: z.number().int().min(0).max(100_000).default(5),
  sku: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(60).nullable().optional()),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export type CafeItemBody = z.infer<typeof cafeItemBody>;

export const cafeItemDto = z.object({
  id: z.string(),
  categoryId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceAmount: z.number(),
  currency: z.string(),
  photoUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  /** False when the item tracks stock and none is left. */
  inStock: z.boolean(),
  trackStock: z.boolean(),
  stockQty: z.number().nullable(),
  lowStockAt: z.number(),
  sku: z.string().nullable(),
  sortOrder: z.number(),
  translations: z
    .record(
      z.string(),
      z.object({ name: z.string(), description: z.string().nullable().optional() }),
    )
    .optional(),
});
export type CafeItemDto = z.infer<typeof cafeItemDto>;
export const cafeCategoryDto = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  translations: z.record(z.string(), z.object({ name: z.string() })).optional(),
  items: z.array(cafeItemDto),
});
export type CafeCategoryDto = z.infer<typeof cafeCategoryDto>;
export const cafeMenuDto = z.object({
  enabled: z.boolean(),
  tableOrdering: z.boolean(),
  /** Set when the menu was opened from a table's QR code. */
  table: z.object({ id: z.string(), label: z.string() }).nullable(),
  categories: z.array(cafeCategoryDto),
});
export type CafeMenuDto = z.infer<typeof cafeMenuDto>;

export const cafeStockBody = z.object({
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0 && Math.abs(n) <= 100_000, { error: 'validation.invalid_amount' }),
  reason: z.enum(CAFE_STOCK_REASONS),
  note: z.preprocess((v) => (v === '' ? null : v), desc.nullable().optional()),
});

// ── Tables ────────────────────────────────────────────────────────────────────
export const cafeTableBody = z.object({
  label: z.string().trim().min(1, { error: 'validation.required' }).max(40),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export const cafeTableDto = z.object({
  id: z.string(),
  label: z.string(),
  code: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
});
export type CafeTableDto = z.infer<typeof cafeTableDto>;

// ── Orders ────────────────────────────────────────────────────────────────────
const orderLines = z
  .array(z.object({ itemId: uuid, qty: z.number().int().min(1).max(50) }))
  .min(1, { error: 'validation.required' })
  .max(30);
const note = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().max(300, { error: 'validation.too_long' }).nullable().optional(),
);
/** Guest at a table (no account): the table code from the QR identifies where to bring it. */
export const tableOrderBody = z.object({
  tableCode: z.string().regex(/^[A-Za-z0-9]{10,32}$/, { error: 'validation.invalid_code' }),
  items: orderLines,
  note,
  /** Optional: so the bar knows who ordered. */
  guestName: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(60, { error: 'validation.too_long' }).nullable().optional(),
  ),
});
/** Member in the app: pick up at the bar, or to a table if scanned. */
export const memberOrderBody = z.object({
  tableCode: z
    .string()
    .regex(/^[A-Za-z0-9]{10,32}$/)
    .nullable()
    .optional(),
  items: orderLines,
  note,
});
/** Staff at the bar. */
export const barOrderBody = z.object({
  tableId: uuid.nullable().optional(),
  memberId: uuid.nullable().optional(),
  items: orderLines,
  note,
  /** Charge right away (typical at the bar). */
  payNow: z.enum(CAFE_PAYMENT_METHODS).nullable().optional(),
});
export type BarOrderBody = z.infer<typeof barOrderBody>;

export const cafeOrderDto = z.object({
  id: z.string(),
  number: z.number(),
  source: z.enum(['table_qr', 'app', 'bar']),
  tableLabel: z.string().nullable(),
  memberName: z.string().nullable(),
  /** Name typed by a guest without an account. */
  guestName: z.string().nullable(),
  status: z.enum(CAFE_ORDER_STATUSES),
  paymentStatus: z.enum(['unpaid', 'paid']),
  paymentMethod: z.enum(CAFE_PAYMENT_METHODS).nullable(),
  totalAmount: z.number(),
  currency: z.string(),
  note: z.string().nullable(),
  fiscalStatus: z.enum(['none', 'pending', 'sent', 'failed']),
  fiscalError: z.string().nullable(),
  items: z.array(
    z.object({ name: z.string(), qty: z.number(), unitPrice: z.number(), lineTotal: z.number() }),
  ),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});
export type CafeOrderDto = z.infer<typeof cafeOrderDto>;
/** What the ordering device gets back: the order plus its secret for following it. */
export const placedOrderDto = cafeOrderDto.extend({ guestToken: z.string() });
export type PlacedOrderDto = z.infer<typeof placedOrderDto>;

export const cafeOrderStatusBody = z.object({
  status: z.enum(['preparing', 'ready', 'served']),
});
export const cafePayBody = z.object({ method: z.enum(CAFE_PAYMENT_METHODS) });
export const cafeCancelBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.reason_min' }).max(300),
});
export const cafeOrdersQuery = z.object({
  /** open = not served/cancelled; today = everything since midnight (club time). */
  view: z.enum(['open', 'today']).default('open'),
});

// ── POS / fiscal adapter ──────────────────────────────────────────────────────
export const CAFE_POS_MODES = ['none', 'webhook'] as const;
export const cafeSettingsBody = z.object({
  enabled: z.boolean(),
  tableOrdering: z.boolean(),
  posMode: z.enum(CAFE_POS_MODES),
  posUrl: z.preprocess(
    (v) => (v === '' ? null : v),
    z
      .string()
      .trim()
      .max(300)
      .regex(/^https:\/\/\S+$/, { error: 'validation.invalid_url' })
      .nullable()
      .optional(),
  ),
});
export type CafeSettingsBody = z.infer<typeof cafeSettingsBody>;
export const cafeSettingsDto = z.object({
  enabled: z.boolean(),
  tableOrdering: z.boolean(),
  posMode: z.enum(CAFE_POS_MODES),
  posUrl: z.string().nullable(),
  /** The signing secret lives only in the server environment (CAFE_POS_SECRET). */
  secretConfigured: z.boolean(),
  failedOrders: z.number(),
  pendingOrders: z.number(),
});
export type CafeSettingsDto = z.infer<typeof cafeSettingsDto>;
export const guestOrderParams = z.object({ id: uuid });
export const guestOrderQuery = z.object({ token: z.string().min(16).max(64) });
