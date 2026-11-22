import { z } from 'zod';
import { uuid } from './common';

/**
 * Business documents: partners (komitenti), incoming / outgoing invoices with VAT lines,
 * stock counts (popis) and the monthly finance overview. Money in minor units (para).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.invalid_date' });
const optText = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const EXPENSE_CATEGORIES = [
  'goods',
  'rent',
  'utilities',
  'equipment',
  'maintenance',
  'supplies',
  'services',
  'marketing',
  'salaries',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const PURCHASE_PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'other'] as const;
export const DOCUMENT_UNITS = ['kom', 'kg', 'g', 'l', 'ml', 'm', 'pak', 'h'] as const;
export type DocumentUnit = (typeof DOCUMENT_UNITS)[number];
export const DOCUMENT_KINDS = ['incoming_invoice', 'outgoing_invoice'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const VAT_RATES = [20, 10, 0] as const;

// ---- partners (komitenti) ----
const digits = (len: number, error: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s/g, '') || null : v),
    z
      .string()
      .regex(new RegExp(`^\\d{${len}}$`), { error })
      .nullable()
      .optional(),
  );
export const partnerBody = z
  .object({
    name: z.string().trim().min(1, { error: 'validation.required' }).max(160),
    taxId: digits(9, 'validation.invalid_tax_id'),
    registryNo: digits(8, 'validation.invalid_registry_no'),
    city: optText(80),
    address: optText(200),
    contact: optText(200),
    email: optText(200),
    phone: optText(40),
    isSupplier: z.boolean().default(true),
    isCustomer: z.boolean().default(false),
    isActive: z.boolean().default(true),
    note: optText(500),
  })
  .refine((p) => p.isSupplier || p.isCustomer, {
    path: ['isSupplier'],
    error: 'validation.partner_role_required',
  });
export type PartnerBody = z.infer<typeof partnerBody>;
export const partnerDto = z.object({
  id: z.string(),
  name: z.string(),
  taxId: z.string().nullable(),
  registryNo: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  contact: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isSupplier: z.boolean(),
  isCustomer: z.boolean(),
  isActive: z.boolean(),
  note: z.string().nullable(),
});
export type PartnerDto = z.infer<typeof partnerDto>;

// ---- documents ----
export const documentLineInput = z.object({
  cafeItemId: uuid.nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES).default('goods'),
  name: z.string().trim().min(1, { error: 'validation.required' }).max(200),
  unit: z.enum(DOCUMENT_UNITS).default('kom'),
  qty: z.number().positive({ error: 'validation.amount_positive' }).max(1_000_000),
  /** Net unit price (without VAT), before the discount. */
  unitPrice: z.number().int().min(0).max(1_000_000_000),
  discountPct: z.number().min(0).max(100).default(0),
  vatRate: z.number().min(0).max(100).default(20),
});
export type DocumentLineInput = z.infer<typeof documentLineInput>;

export const documentBody = z
  .object({
    kind: z.enum(DOCUMENT_KINDS),
    partnerId: uuid,
    number: z.string().trim().min(1, { error: 'validation.required' }).max(60),
    turnoverOn: isoDate,
    dueOn: isoDate.nullable().optional(),
    note: optText(500),
    internalNote: optText(500),
    lines: z.array(documentLineInput).min(1, { error: 'validation.required' }).max(500),
    /** Already paid when entered (e.g. cash on delivery). */
    paid: z
      .object({ paidOn: isoDate, method: z.enum(PURCHASE_PAYMENT_METHODS) })
      .nullable()
      .optional(),
  })
  .refine((d) => !d.dueOn || d.dueOn >= d.turnoverOn, {
    path: ['dueOn'],
    error: 'validation.due_before_turnover',
  })
  .refine((d) => d.lines.every((l) => !l.cafeItemId || Number.isInteger(l.qty)), {
    path: ['lines'],
    error: 'validation.whole_qty_for_stock',
  });
export type DocumentBody = z.infer<typeof documentBody>;
export const payDocumentBody = z.object({
  paidOn: isoDate,
  method: z.enum(PURCHASE_PAYMENT_METHODS),
});
export const voidDocumentBody = z.object({
  reason: z.string().trim().min(3, { error: 'validation.reason_min' }).max(300),
});

export const documentLineDto = z.object({
  cafeItemId: z.string().nullable(),
  category: z.string(),
  name: z.string(),
  unit: z.string(),
  qty: z.number(),
  unitPrice: z.number(),
  discountPct: z.number(),
  vatRate: z.number(),
  netAmount: z.number(),
  vatAmount: z.number(),
  totalAmount: z.number(),
});
export const documentDto = z.object({
  id: z.string(),
  internalNo: z.number(),
  kind: z.enum(DOCUMENT_KINDS),
  partnerId: z.string(),
  partnerName: z.string(),
  partnerTaxId: z.string().nullable(),
  number: z.string(),
  turnoverOn: z.string(),
  dueOn: z.string().nullable(),
  netAmount: z.number(),
  discountAmount: z.number(),
  vatAmount: z.number(),
  totalAmount: z.number(),
  currency: z.string(),
  status: z.enum(['unpaid', 'paid', 'void']),
  paidOn: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  note: z.string().nullable(),
  internalNote: z.string().nullable(),
  voidReason: z.string().nullable(),
  overdue: z.boolean(),
  lines: z.array(documentLineDto),
});
export type DocumentDto = z.infer<typeof documentDto>;
export const documentsQuery = z.object({
  kind: z.enum(['all', ...DOCUMENT_KINDS]).default('all'),
  status: z.enum(['all', 'unpaid', 'paid', 'void']).default('all'),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  partnerId: uuid.optional(),
});

/** Same rounding on client and server: per line, net after discount, then VAT. */
export function lineAmounts(l: {
  qty: number;
  unitPrice: number;
  discountPct?: number;
  vatRate?: number;
}) {
  const gross = Math.round(l.qty * l.unitPrice);
  const discount = Math.round((gross * (l.discountPct ?? 0)) / 100);
  const net = gross - discount;
  const vat = Math.round((net * (l.vatRate ?? 0)) / 100);
  return { gross, discount, net, vat, total: net + vat };
}

// ---- partner card (kartica komitenta) ----
export const partnerCardQuery = z.object({ from: isoDate, to: isoDate });
export const partnerCardDto = z.object({
  partner: partnerDto,
  from: z.string(),
  to: z.string(),
  rows: z.array(
    z.object({
      id: z.string(),
      internalNo: z.number(),
      kind: z.enum(DOCUMENT_KINDS),
      number: z.string(),
      turnoverOn: z.string(),
      dueOn: z.string().nullable(),
      status: z.enum(['unpaid', 'paid', 'void']),
      netAmount: z.number(),
      vatAmount: z.number(),
      totalAmount: z.number(),
      paidOn: z.string().nullable(),
    }),
  ),
  totals: z.object({
    /** Incoming invoices (bought), outgoing (sold), with VAT; void ones excluded. */
    incoming: z.number(),
    outgoing: z.number(),
    incomingUnpaid: z.number(),
    outgoingUnpaid: z.number(),
    /** > 0: the partner owes the club; < 0: the club owes the partner. */
    balance: z.number(),
  }),
});
export type PartnerCardDto = z.infer<typeof partnerCardDto>;

// ---- stock count (popis) ----
export const stockCountBody = z.object({
  countedOn: isoDate,
  note: optText(500),
  lines: z
    .array(z.object({ cafeItemId: uuid, countedQty: z.number().int().min(0).max(1_000_000) }))
    .min(1, { error: 'validation.required' })
    .max(1000),
});
export const stockCountDto = z.object({
  id: z.string(),
  countedOn: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  lines: z.array(
    z.object({
      cafeItemId: z.string(),
      name: z.string(),
      systemQty: z.number(),
      countedQty: z.number(),
      diff: z.number(),
    }),
  ),
});
export type StockCountDto = z.infer<typeof stockCountDto>;

// ---- finance ----
export const financeQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'validation.invalid_date' }),
});
export const financeDto = z.object({
  month: z.string(),
  currency: z.string(),
  income: z.object({
    memberships: z.number(),
    services: z.number(),
    cafe: z.number(),
    /** Outgoing invoices, without VAT. */
    invoices: z.number(),
    total: z.number(),
  }),
  costs: z.object({
    /** Incoming invoices by category, without VAT. */
    byCategory: z.array(z.object({ category: z.string(), amount: z.number() })),
    trainerShares: z.number(),
    total: z.number(),
  }),
  vat: z.object({ input: z.number(), output: z.number(), balance: z.number() }),
  result: z.number(),
  unpaidInvoices: z.object({ count: z.number(), amount: z.number(), overdue: z.number() }),
  receivables: z.object({ count: z.number(), amount: z.number() }),
});
export type FinanceDto = z.infer<typeof financeDto>;
