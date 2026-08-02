// pos_modules/orders/printing-facility/ReceiptPreview.tsx
// Live, paper-accurate preview of the printed receipt. Renders the SAME
// StyledLine[] the thermal service prints (via the shared receiptLayout engine),
// on a fixed-width monospace "thermal paper" card. Updates instantly as the
// tenant edits receipt settings.

'use client';

import { useMemo } from 'react';
import type { ISettings } from '@/types/settings.types';
import { buildReceiptRenderOptions } from './receiptOptions';
import { renderReceipt, type ReceiptLayoutData, type StyledLine } from './receiptLayout';

interface ReceiptPreviewProps {
  settings: ISettings;
}

// A representative order so the preview always shows a realistic receipt.
const SAMPLE = {
  orderNumber: '1042',
  date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
  time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  table: 'T4',
  server: 'Ali',
  customer: 'John Doe',
  orderMode: 'Dine In',
  items: [
    { name: 'Cappuccino', quantity: 2, unitPrice: 4.5, total: 9.0, modifiers: ['Oat milk', 'Extra shot'] },
    { name: 'Club Sandwich', quantity: 1, unitPrice: 7.25, total: 7.25, notes: 'No onions' },
    { name: 'Chocolate Cake', quantity: 1, unitPrice: 4.5, total: 4.5 },
  ],
  subtotal: 20.75,
  discount: 2.0,
  discountName: 'Discount (10%)',
  serviceCharge: 1.5,
  serviceChargeName: 'Service Charge',
  tax: 1.66,
  taxRate: 10,
  tip: 2.0,
  adjustments: [
    { name: 'Staff Discount', amount: 1.5, isDeduction: true },
    { name: 'Packaging', amount: 0.5, isDeduction: false },
  ],
  total: 23.91,
  paymentMethod: 'Cash',
  amountPaid: 25.0,
  change: 1.09,
};

function buildSampleData(settings: ISettings): ReceiptLayoutData {
  const a = settings.businessAddress;
  const address = [
    [a?.line1, a?.line2].filter(Boolean).join(', '),
    [a?.city, a?.state, a?.postalCode].filter(Boolean).join(' '),
    a?.country,
  ].filter((s): s is string => !!s && s.trim().length > 0);

  return {
    storeName: settings.businessName || 'My Restaurant',
    address,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    taxId: settings.tax?.taxRegistrationNumber || 'TAX-000-123',
    orderNumber: SAMPLE.orderNumber,
    date: SAMPLE.date,
    time: SAMPLE.time,
    table: SAMPLE.table,
    server: SAMPLE.server,
    customer: SAMPLE.customer,
    orderMode: SAMPLE.orderMode,
    items: SAMPLE.items,
    subtotal: SAMPLE.subtotal,
    discount: SAMPLE.discount,
    discountName: SAMPLE.discountName,
    serviceCharge: SAMPLE.serviceCharge,
    serviceChargeName: SAMPLE.serviceChargeName,
    tax: SAMPLE.tax,
    taxRate: SAMPLE.taxRate,
    taxLabel: settings.tax?.taxLabel || 'Tax',
    tip: SAMPLE.tip,
    adjustments: SAMPLE.adjustments,
    total: SAMPLE.total,
    paymentMethod: SAMPLE.paymentMethod,
    amountPaid: SAMPLE.amountPaid,
    change: SAMPLE.change,
    footerMessage: settings.receipt.footerText,
    hasLogo: settings.receipt.showLogo,
    qrValue: settings.receipt.qrEnabled
      ? (settings.receipt.qrContent === 'custom'
          ? (settings.receipt.qrCustomValue || 'https://example.com')
          : `ORDER-${SAMPLE.orderNumber}`)
      : undefined,
  };
}

// Deterministic pseudo-QR so the preview conveys placement/size (the real QR is
// rendered by the printer). Includes finder squares for authenticity.
function pseudoQr(value: string, n = 21): boolean[][] {
  const seed = value || 'QR';
  let h = 2166136261;
  const grid: boolean[][] = [];
  for (let y = 0; y < n; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < n; x++) {
      h = ((h ^ (x * 73856093 + y * 19349663 + seed.charCodeAt((x + y) % seed.length))) >>> 0) * 16777619 >>> 0;
      row.push((h & 0x10) !== 0);
    }
    grid.push(row);
  }
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6 || y === 0 || y === 6;
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      grid[oy + y][ox + x] = edge || core;
    }
  };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  return grid;
}

export default function ReceiptPreview({ settings }: ReceiptPreviewProps) {
  const options = useMemo(() => buildReceiptRenderOptions(settings), [settings]);
  const lines = useMemo(() => renderReceipt(buildSampleData(settings), options), [settings, options]);
  const logoUrl = settings.logoUrl;

  const alignToJustify = (a: StyledLine['align']) =>
    a === 'c' ? 'center' : a === 'r' ? 'flex-end' : 'flex-start';

  return (
    <div className="flex flex-col items-center">
      <div
        className="receipt-paper"
        style={{
          background: '#fdfdfb',
          color: '#111',
          width: `${options.paperWidth + 4}ch`,
          maxWidth: '100%',
          padding: '16px 12px',
          fontFamily: "'Courier New', ui-monospace, Menlo, Consolas, monospace",
          fontSize: '12px',
          lineHeight: 1.35,
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
          borderRadius: 2,
          // jagged thermal-paper top/bottom edges
          clipPath:
            'polygon(0% 8px, 2% 0, 4% 8px, 6% 0, 8% 8px, 10% 0, 12% 8px, 14% 0, 16% 8px, 18% 0, 20% 8px, 22% 0, 24% 8px, 26% 0, 28% 8px, 30% 0, 32% 8px, 34% 0, 36% 8px, 38% 0, 40% 8px, 42% 0, 44% 8px, 46% 0, 48% 8px, 50% 0, 52% 8px, 54% 0, 56% 8px, 58% 0, 60% 8px, 62% 0, 64% 8px, 66% 0, 68% 8px, 70% 0, 72% 8px, 74% 0, 76% 8px, 78% 0, 80% 8px, 82% 0, 84% 8px, 86% 0, 88% 8px, 90% 0, 92% 8px, 94% 0, 96% 8px, 98% 0, 100% 8px, 100% calc(100% - 8px), 98% 100%, 96% calc(100% - 8px), 94% 100%, 92% calc(100% - 8px), 90% 100%, 88% calc(100% - 8px), 86% 100%, 84% calc(100% - 8px), 82% 100%, 80% calc(100% - 8px), 78% 100%, 76% calc(100% - 8px), 74% 100%, 72% calc(100% - 8px), 70% 100%, 68% calc(100% - 8px), 66% 100%, 64% calc(100% - 8px), 62% 100%, 60% calc(100% - 8px), 58% 100%, 56% calc(100% - 8px), 54% 100%, 52% calc(100% - 8px), 50% 100%, 48% calc(100% - 8px), 46% 100%, 44% calc(100% - 8px), 42% 100%, 40% calc(100% - 8px), 38% 100%, 36% calc(100% - 8px), 34% 100%, 32% calc(100% - 8px), 30% 100%, 28% calc(100% - 8px), 26% 100%, 24% calc(100% - 8px), 22% 100%, 20% calc(100% - 8px), 18% 100%, 16% calc(100% - 8px), 14% 100%, 12% calc(100% - 8px), 10% 100%, 8% calc(100% - 8px), 6% 100%, 4% calc(100% - 8px), 2% 100%, 0% calc(100% - 8px))',
        }}
      >
        {lines.map((ln, i) => {
          if (ln.kind === 'logo') {
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="logo"
                    style={{ maxHeight: 56, maxWidth: '80%', filter: 'grayscale(1) contrast(1.5)', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ border: '1px dashed #999', padding: '10px 18px', fontSize: 11, color: '#666' }}>LOGO</div>
                )}
              </div>
            );
          }
          if (ln.kind === 'qr') {
            const grid = pseudoQr(ln.text);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${grid.length}, 4px)`,
                    gridTemplateRows: `repeat(${grid.length}, 4px)`,
                  }}
                >
                  {grid.flatMap((row, y) =>
                    row.map((on, x) => (
                      <div key={`${y}-${x}`} style={{ width: 4, height: 4, background: on ? '#111' : '#fdfdfb' }} />
                    )),
                  )}
                </div>
              </div>
            );
          }
          if (ln.kind === 'blank') return <div key={i} style={{ height: '0.6em' }} />;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: alignToJustify(ln.align),
                whiteSpace: 'pre',
                fontWeight: ln.bold ? 700 : 400,
                fontSize: ln.size === 'large' ? '16px' : undefined,
                letterSpacing: ln.kind === 'divider' ? '-0.5px' : undefined,
              }}
            >
              {ln.text}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[#666]">
        {settings.receipt.paperWidth} · {options.paperWidth} chars/line · live preview of thermal output
      </p>
    </div>
  );
}
