// pos_modules/orders/printing-facility/receiptLayout.ts
//
// SHARED RECEIPT LAYOUT ENGINE — single source of truth for the printed receipt.
//
// ⚠️  MUST STAY IN SYNC WITH  xp-thermal-service/src/templates/receipt-template.ts
//     Both files implement the SAME column math + 4 template presets so the POS
//     live preview is byte-for-byte identical to what the thermal printer emits.
//     If you change a layout here, mirror it there (and vice-versa).
//
// The engine turns normalized receipt data + ReceiptRenderOptions into an array
// of StyledLine (text + alignment + emphasis). The POS renders these to a paper
// panel; the service renders the identical lines to ESC/POS.

import type { ReceiptRenderOptions, ReceiptTemplateId } from '@/types/settings.types';

// ─────────────────────────────────────────────────────────────────────────────
// Public data + line types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceiptLayoutItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  modifiers?: string[];
  notes?: string;
}

export interface ReceiptLayoutData {
  storeName: string;
  address: string[];
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;

  orderNumber: string;
  date: string;
  time: string;
  table?: string;
  server?: string;
  customer?: string;
  orderMode?: string;

  items: ReceiptLayoutItem[];

  subtotal: number;
  discount?: number;
  discountName?: string;
  tax?: number;
  taxRate?: number;
  taxLabel?: string;
  serviceCharge?: number;
  serviceChargeName?: string;
  tip?: number;
  /** Custom bill adjustments (discounts/surcharges/fees) — each printed as its own line. */
  adjustments?: { name: string; amount: number; isDeduction: boolean }[];
  total: number;

  paymentMethod?: string;
  amountPaid?: number;
  change?: number;
  /**
   * Every payment taken on this order, in the order they were taken.
   * `label` is the tenant's own method name (`methodLabel`/`mn`) so a custom
   * method survives onto the receipt, falling back to the coarse category.
   *
   * Only used when there is more than one — an order settled by a single
   * method still prints exactly as it always has. See the PAYMENT section.
   */
  payments?: { label: string; amount: number }[];

  footerMessage?: string;
  /** True when a logo should occupy a centered block (preview shows it, print rasters it). */
  hasLogo?: boolean;
  /** The value encoded by the QR block, when enabled. */
  qrValue?: string;
}

export interface StyledLine {
  text: string;
  align: 'l' | 'c' | 'r';
  bold?: boolean;
  /** 'large' = double-size (used for hero totals / elegant store name). */
  size?: 'normal' | 'large';
  kind?: 'text' | 'divider' | 'logo' | 'qr' | 'blank';
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────────────────────────────────────

function formatMoney(amount: number, c: ReceiptRenderOptions['currency']): string {
  // Round to the currency's precision, then drop trailing zeros:
  // 5 → "5", 5.50 → "5.5", 5.00 → "5". (No forced ".00".)
  const rounded = Number((Number.isFinite(amount) ? amount : 0).toFixed(c.decimals));
  const n = String(rounded);
  return c.position === 'after' ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-width column math (ported from xp-thermal-service layout-utils.ts)
// Every helper returns strings guaranteed <= width characters.
// ─────────────────────────────────────────────────────────────────────────────

const rpad = (s: string, w: number): string => (s.length >= w ? s.substring(0, w) : s + ' '.repeat(w - s.length));
const lpad = (s: string, w: number): string => (s.length >= w ? s.substring(s.length - w) : ' '.repeat(w - s.length) + s);

class Layout {
  readonly width: number;
  readonly labelWidth: number;
  readonly qtyColW = 3;
  readonly amtColW: number;

  constructor(width: number) {
    this.width = width;
    this.labelWidth = Math.min(14, Math.max(8, Math.floor(width * 0.25)));
    this.amtColW = Math.min(12, Math.max(8, Math.ceil(width * 0.2)));
  }

  private clip(s: string): string {
    return s.length > this.width ? s.substring(0, this.width) : s;
  }

  divider(char = '-'): string {
    return char.repeat(this.width);
  }

  labelValue(label: string, value: string): string[] {
    const prefix = rpad(label, this.labelWidth) + ': ';
    const valueSpace = this.width - prefix.length;
    if (valueSpace <= 0) return [this.clip(label), this.clip(value)];
    if (value.length <= valueSpace) return [this.clip(prefix + value)];
    const lines = this.wordWrap(value, valueSpace);
    const indent = ' '.repeat(prefix.length);
    return [this.clip(prefix + lines[0]), ...lines.slice(1).map((l) => this.clip(indent + l))];
  }

  totalsRow(label: string, value: string): string {
    const gap = this.width - label.length - value.length;
    if (gap >= 1) return this.clip(label + ' '.repeat(gap) + value);
    const maxLabel = this.width - value.length - 1;
    if (maxLabel <= 0) return this.clip(value);
    return this.clip(label.substring(0, maxLabel) + ' ' + value);
  }

  itemsHeader(col1 = 'ITEM', col2 = 'QTY', col3 = 'AMT'): string {
    const right = ' ' + lpad(col2, this.qtyColW) + '  ' + lpad(col3, this.amtColW);
    const nameW = Math.max(1, this.width - right.length);
    return this.clip(rpad(col1, nameW) + right);
  }

  itemRow(name: string, qty: string, amount: string): string[] {
    const usedAmtW = Math.max(this.amtColW, amount.length);
    const usedQtyW = Math.max(this.qtyColW, qty.length);
    const right = ' ' + lpad(qty, usedQtyW) + '  ' + lpad(amount, usedAmtW);
    const nameW = Math.max(1, this.width - right.length);
    if (name.length <= nameW) return [this.clip(rpad(name, nameW) + right)];
    const nameLines = this.wordWrap(name, nameW);
    const first = this.clip(rpad(nameLines[0], nameW) + right);
    const rest = nameLines.slice(1).map((l) => this.clip('  ' + l));
    return [first, ...rest];
  }

  /** name + amount only (minimal template — no qty column). */
  nameAmountRow(name: string, amount: string): string[] {
    const usedAmtW = Math.max(this.amtColW, amount.length);
    const right = '  ' + lpad(amount, usedAmtW);
    const nameW = Math.max(1, this.width - right.length);
    if (name.length <= nameW) return [rpad(name, nameW) + right];
    const nameLines = this.wordWrap(name, nameW);
    return [rpad(nameLines[0], nameW) + right, ...nameLines.slice(1).map((l) => '  ' + l)];
  }

  wordWrap(text: string, maxWidth?: number): string[] {
    const w = maxWidth ?? this.width;
    if (text.length <= w) return [text];
    const lines: string[] = [];
    const words = text.split(' ');
    let cur = '';
    for (const word of words) {
      if (word.length > w) {
        if (cur) { lines.push(cur); cur = ''; }
        let rem = word;
        while (rem.length > w) { lines.push(rem.substring(0, w)); rem = rem.substring(w); }
        if (rem) cur = rem;
        continue;
      }
      const test = cur ? `${cur} ${word}` : word;
      if (test.length <= w) cur = test;
      else { if (cur) lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    return lines.length > 0 ? lines : [''];
  }

  indented(text: string, indent = 2, prefix = ''): string[] {
    const pfx = prefix ? ' '.repeat(indent) + prefix + ' ' : ' '.repeat(indent);
    const contentWidth = this.width - pfx.length;
    if (contentWidth <= 0) return [this.clip(text)];
    if (text.length <= contentWidth) return [this.clip(pfx + text)];
    const wrapped = this.wordWrap(text, contentWidth);
    const cont = ' '.repeat(pfx.length);
    return [this.clip(pfx + wrapped[0]), ...wrapped.slice(1).map((l) => this.clip(cont + l))];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template presets — the four variants share one core builder.
// ─────────────────────────────────────────────────────────────────────────────

interface Preset {
  /** blank spacer lines between sections */
  spacer: boolean;
  /** divider character */
  div: string;
  /** print the "qty x unitPrice" sub-line under each item */
  unitPriceLine: boolean;
  /** double-size TOTAL */
  heroTotal: boolean;
  /** centered title line under the header (e.g. "RECEIPT") */
  title?: string;
  /** minimal mode: only store name, items(name+amount), TOTAL, thank-you */
  minimal: boolean;
}

const PRESETS: Record<ReceiptTemplateId, Preset> = {
  classic: { spacer: true, div: '-', unitPriceLine: true, heroTotal: false, minimal: false },
  compact: { spacer: false, div: '-', unitPriceLine: false, heroTotal: false, minimal: false },
  elegant: { spacer: true, div: '=', unitPriceLine: true, heroTotal: true, title: 'RECEIPT', minimal: false },
  minimal: { spacer: false, div: '-', unitPriceLine: false, heroTotal: false, minimal: true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

export function renderReceipt(data: ReceiptLayoutData, options: ReceiptRenderOptions): StyledLine[] {
  const p = PRESETS[options.template] ?? PRESETS.classic;
  const f = options.fields;
  const L = new Layout(options.paperWidth);
  const money = (n: number) => formatMoney(n, options.currency);
  const out: StyledLine[] = [];

  const push = (text: string, align: StyledLine['align'] = 'l', extra: Partial<StyledLine> = {}) =>
    out.push({ text, align, kind: 'text', ...extra });
  const divider = () => out.push({ text: L.divider(p.div), align: 'l', kind: 'divider' });
  const blank = () => { if (p.spacer) out.push({ text: '', align: 'l', kind: 'blank' }); };

  // ── HEADER (always centered) ───────────────────────────────────────────────
  if (f.logo && data.hasLogo) out.push({ text: '', align: 'c', kind: 'logo' });
  if (f.businessName && data.storeName) {
    push(data.storeName, 'c', { bold: true, size: p.heroTotal ? 'large' : 'normal' });
  }
  if (!p.minimal) {
    if (f.address) for (const a of data.address) for (const ln of L.wordWrap(a)) push(ln, 'c');
    if (f.phone && data.phone) push(`Tel: ${data.phone}`, 'c');
    if (f.email && data.email) push(data.email, 'c');
    if (f.website && data.website) push(data.website, 'c');
    if (f.taxId && data.taxId) push(`Tax ID: ${data.taxId}`, 'c');
  }
  if (p.title) { blank(); push(p.title, 'c', { bold: true }); }
  blank();

  // ── MINIMAL: store name → items(name+amount) → TOTAL → thank-you ────────────
  if (p.minimal) {
    if (f.orderNumber) push(`Order #${data.orderNumber}`, 'c');
    divider();
    for (const it of data.items) {
      for (const ln of L.nameAmountRow(`${it.quantity} ${it.name}`, money(it.total))) push(ln, 'l');
    }
    divider();
    push(L.totalsRow('TOTAL', money(data.total)), 'l', { bold: true });
    divider();
    if (f.thankYou) push('Thank you!', 'c');
    if (f.poweredBy) push('Powered By XenithPulse.com', 'c');
    return out;
  }

  // ── ORDER META ─────────────────────────────────────────────────────────────
  divider();
  const lv = (label: string, value: string, bold = false) => {
    for (const ln of L.labelValue(label, value)) push(ln, 'l', bold ? { bold: true } : {});
  };
  if (f.orderNumber) lv('Order', `#${data.orderNumber}`, true);
  if (f.dateTime) { lv('Date', data.date); if (data.time) lv('Time', data.time); }
  if (f.table && data.table) lv('Table', data.table);
  if (f.orderMode && data.orderMode) lv('Mode', data.orderMode);
  if (f.server && data.server) lv('Server', data.server);
  if (f.customer && data.customer) lv('Customer', data.customer);
  divider();

  // ── ITEMS ──────────────────────────────────────────────────────────────────
  push(L.itemsHeader('Item', 'Qty', 'Amount'), 'l', { bold: true });
  divider();
  for (const it of data.items) {
    for (const ln of L.itemRow(it.name, String(it.quantity), money(it.total))) push(ln, 'l');
    if (p.unitPriceLine && f.unitPrice) {
      for (const ln of L.indented(`${it.quantity} x ${money(it.unitPrice)}`, 2)) push(ln, 'l');
    }
    if (f.itemModifiers && it.modifiers?.length) {
      for (const m of it.modifiers) for (const ln of L.indented(m, 2, '+')) push(ln, 'l');
    }
    if (f.itemNotes && it.notes) for (const ln of L.indented(it.notes, 2, '*')) push(ln, 'l');
  }
  divider();

  // ── TOTALS ─────────────────────────────────────────────────────────────────
  push(L.totalsRow('Subtotal:', money(data.subtotal)), 'l');
  if (f.discount && data.discount && data.discount > 0) {
    const label = data.discountName ? `${data.discountName}:` : 'Discount:';
    push(L.totalsRow(label, `-${money(data.discount)}`), 'l');
  }
  if (f.serviceCharge && data.serviceCharge && data.serviceCharge > 0) {
    const label = data.serviceChargeName ? `${data.serviceChargeName}:` : 'Service:';
    push(L.totalsRow(label, money(data.serviceCharge)), 'l');
  }
  if (f.taxBreakdown && data.tax && data.tax > 0) {
    const label = data.taxRate ? `${data.taxLabel || 'Tax'} (${data.taxRate}%):` : `${data.taxLabel || 'Tax'}:`;
    push(L.totalsRow(label, money(data.tax)), 'l');
  }
  // Custom bill adjustments (discounts/surcharges/fees) — one line each, signed.
  if (data.adjustments?.length) {
    for (const adj of data.adjustments) {
      const amt = adj.isDeduction ? `-${money(adj.amount)}` : money(adj.amount);
      push(L.totalsRow(`${adj.name}:`, amt), 'l');
    }
  }
  if (f.tip && data.tip && data.tip > 0) push(L.totalsRow('Tip:', money(data.tip)), 'l');
  divider();
  if (p.heroTotal) {
    // Short, centered, double-size hero total (safe from width overflow).
    push(`TOTAL  ${money(data.total)}`, 'c', { bold: true, size: 'large' });
  } else {
    push(L.totalsRow('TOTAL:', money(data.total)), 'l', { bold: true });
  }
  divider();

  // ── PAYMENT ────────────────────────────────────────────────────────────────
  // A bill settled across two methods used to print as though one method had
  // paid all of it, which is wrong on a document a customer keeps and an
  // accountant reads. An order paid by ONE method still prints byte-identically
  // to before — this is the most-printed artefact in the product.
  const isSplit = f.amountPaid && (data.payments?.length ?? 0) > 1;

  if (isSplit) {
    const pays = data.payments!;
    // Two-space indent so the lines read as belonging to "Paid" above them.
    const indentedRow = (label: string, value: string) => L.totalsRow('  ' + label, value);
    push('Paid', 'l', { bold: true });
    pays.forEach((pay, i) => {
      // `paymentMethod` off means the customer's copy should not name methods;
      // the amounts still have to add up, so the lines stay and lose the name.
      push(indentedRow(f.paymentMethod ? pay.label : `Payment ${i + 1}`, money(pay.amount)), 'l');
    });
    push('  ' + p.div.repeat(Math.max(1, L.width - 2)), 'l');
    push(indentedRow('Total Paid', money(data.amountPaid ?? pays.reduce((s, x) => s + x.amount, 0))), 'l', { bold: true });
    if (f.change && data.change !== undefined && data.change > 0) {
      push(indentedRow('Change', money(data.change)), 'l');
    }
    divider();
  } else {
    const hasPayment = (f.paymentMethod && data.paymentMethod) ||
      (f.amountPaid && data.amountPaid !== undefined) ||
      (f.change && data.change !== undefined && data.change > 0);
    if (hasPayment) {
      if (f.paymentMethod && data.paymentMethod) push(L.totalsRow('Payment:', data.paymentMethod), 'l');
      if (f.amountPaid && data.amountPaid !== undefined) push(L.totalsRow('Amount Paid:', money(data.amountPaid)), 'l');
      if (f.change && data.change !== undefined && data.change > 0) push(L.totalsRow('Change:', money(data.change)), 'l');
      divider();
    }
  }

  // ── QR ─────────────────────────────────────────────────────────────────────
  if (f.qrCode && data.qrValue) {
    blank();
    out.push({ text: data.qrValue, align: 'c', kind: 'qr' });
    push('Scan for details', 'c');
  }

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  blank();
  if (f.footerMessage && data.footerMessage) for (const ln of L.wordWrap(data.footerMessage)) push(ln, 'c');
  if (f.thankYou) push('Thank you!', 'c', { bold: p.heroTotal });
  if (f.poweredBy) { blank(); push('Powered By XenithPulse.com', 'c'); }

  return out;
}
