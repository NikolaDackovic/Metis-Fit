import { DOCUMENT_UNITS, type DocumentUnit } from '@grit/validation';

/**
 * Document lines from an Excel (.xlsx) or CSV file. The first row holds the column names.
 * Required: Naziv, Količina, JM. Optional: Cena (jed. bez PDV), PDV %, Rabat %.
 * Header names are matched without case, accents or punctuation, in sr / en / ru.
 */
export type ImportedLine = {
  name: string;
  qty: number;
  unit: DocumentUnit;
  /** Net unit price in RSD (not para); null when the column is missing. */
  price: number | null;
  vatRate: number | null;
  discountPct: number | null;
};
export type ImportResult = { lines: ImportedLine[]; errors: Array<{ row: number; key: string }> };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/[^a-z0-9а-я%]/g, '');

const HEADERS: Record<keyof ImportedLine, string[]> = {
  name: ['naziv', 'artikal', 'proizvod', 'name', 'item', 'наименование', 'название', 'товар'],
  qty: ['kolicina', 'kol', 'qty', 'quantity', 'количество', 'колво'],
  unit: ['jm', 'jedinicamere', 'jedmere', 'unit', 'uom', 'едизм', 'единица', 'ед'],
  price: [
    'cena',
    'jedbezpdv',
    'cenabezpdv',
    'jedinicnacena',
    'nabavnacena',
    'price',
    'unitprice',
    'цена',
  ],
  vatRate: ['pdv', 'pdv%', 'stopapdv', 'vat', 'vat%', 'ндс', 'ндс%'],
  discountPct: ['rabat', 'rabat%', 'popust', 'discount', 'discount%', 'скидка', 'скидка%'],
};

const UNIT_ALIASES: Record<string, DocumentUnit> = {
  kom: 'kom',
  komad: 'kom',
  kos: 'kom',
  pcs: 'kom',
  pc: 'kom',
  шт: 'kom',
  kg: 'kg',
  кг: 'kg',
  g: 'g',
  gr: 'g',
  г: 'g',
  l: 'l',
  lit: 'l',
  litar: 'l',
  л: 'l',
  ml: 'ml',
  мл: 'ml',
  m: 'm',
  м: 'm',
  pak: 'pak',
  paket: 'pak',
  pack: 'pak',
  уп: 'pak',
  h: 'h',
  sat: 'h',
  час: 'h',
};

/** "1.234,50" / "1234.5" / 12 → number. */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/\s|%/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseRows(rows: unknown[][]): ImportResult {
  const errors: ImportResult['errors'] = [];
  const header = (rows[0] ?? []).map((c) => norm(String(c ?? '')));
  const col = Object.fromEntries(
    (Object.keys(HEADERS) as Array<keyof ImportedLine>).map((k) => [
      k,
      header.findIndex((h) => HEADERS[k].includes(h)),
    ]),
  ) as Record<keyof ImportedLine, number>;
  if (col.name < 0 || col.qty < 0 || col.unit < 0) {
    return { lines: [], errors: [{ row: 1, key: 'admin.business.import.missing_columns' }] };
  }
  const lines: ImportedLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    const name = String(r[col.name] ?? '').trim();
    if (!name && r.every((c) => c == null || String(c).trim() === '')) return; // empty row
    const qty = parseNumber(r[col.qty]);
    const unitRaw = norm(String(r[col.unit] ?? ''));
    const unit =
      UNIT_ALIASES[unitRaw] ?? (DOCUMENT_UNITS as readonly string[]).find((u) => u === unitRaw);
    if (!name) return errors.push({ row, key: 'admin.business.import.no_name' });
    if (!qty || qty <= 0) return errors.push({ row, key: 'admin.business.import.bad_qty' });
    if (!unit) return errors.push({ row, key: 'admin.business.import.bad_unit' });
    const opt = (k: 'price' | 'vatRate' | 'discountPct') =>
      col[k] >= 0 ? parseNumber(r[col[k]]) : null;
    lines.push({
      name: name.slice(0, 200),
      qty,
      unit: unit as DocumentUnit,
      price: opt('price'),
      vatRate: opt('vatRate'),
      discountPct: opt('discountPct'),
    });
  });
  return { lines, errors };
}

/** Very small CSV reader: `;` or `,` separated, quotes for fields with separators. */
const BOM = String.fromCharCode(0xfeff);

export function parseCsv(text: string): string[][] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function readLinesFile(file: File): Promise<ImportResult> {
  if (/\.(csv|txt)$/i.test(file.name)) return parseRows(parseCsv(await file.text()));
  if (!/\.xlsx$/i.test(file.name))
    return { lines: [], errors: [{ row: 0, key: 'admin.business.import.bad_file' }] };
  try {
    const { readSheet } = await import('read-excel-file/browser');
    return parseRows((await readSheet(file)) as unknown[][]);
  } catch {
    return { lines: [], errors: [{ row: 0, key: 'admin.business.import.bad_file' }] };
  }
}

/** Template the club can fill in Excel (semicolon CSV with BOM opens correctly in Excel). */
export function downloadTemplate() {
  const csv =
    BOM +
    'Naziv;Količina;JM;Cena bez PDV;PDV %;Rabat %\r\nCoca Cola 0,5 l;24;kom;54,00;20;0\r\nProteinski prah;2;kg;3200,00;20;5\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stavke-sablon.csv';
  a.click();
  URL.revokeObjectURL(url);
}
