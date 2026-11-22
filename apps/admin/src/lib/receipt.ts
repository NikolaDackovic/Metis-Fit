/**
 * Printable payment confirmation (not a fiscal receipt). Opens a small window and prints it.
 * All values are escaped; the window is built from strings, no external resources.
 */
export interface ReceiptData {
  club: string;
  title: string;
  number: string;
  date: string;
  customer: string | null;
  lines: Array<{ name: string; qty: number; amount: string }>;
  total: string;
  method: string;
  cashier: string | null;
  labels: { customer: string; total: string; method: string; cashier: string; notFiscal: string };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function printReceipt(r: ReceiptData) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  const rows = r.lines
    .map(
      (l) =>
        `<tr><td>${l.qty} × ${esc(l.name)}</td><td style="text-align:right">${esc(l.amount)}</td></tr>`,
    )
    .join('');
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>${esc(r.title)} ${esc(r.number)}</title>` +
      `<body style="font-family:system-ui,sans-serif;font-size:13px;max-width:320px;margin:16px auto">` +
      `<h2 style="margin:0 0 4px">${esc(r.club)}</h2>` +
      `<p style="margin:0 0 12px">${esc(r.title)} ${esc(r.number)}<br>${esc(r.date)}</p>` +
      (r.customer
        ? `<p style="margin:0 0 8px">${esc(r.labels.customer)}: ${esc(r.customer)}</p>`
        : '') +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>` +
      `<hr><p style="display:flex;justify-content:space-between;font-weight:700;margin:4px 0">` +
      `<span>${esc(r.labels.total)}</span><span>${esc(r.total)}</span></p>` +
      `<p style="margin:4px 0">${esc(r.labels.method)}: ${esc(r.method)}</p>` +
      (r.cashier ? `<p style="margin:4px 0">${esc(r.labels.cashier)}: ${esc(r.cashier)}</p>` : '') +
      `<p style="margin-top:16px;font-weight:700;text-transform:uppercase">${esc(r.labels.notFiscal)}</p>` +
      `<script>onload=()=>print()</script></body>`,
  );
  w.document.close();
}
