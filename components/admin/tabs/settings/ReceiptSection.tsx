// components/admin/tabs/settings/ReceiptSection.tsx
// Receipt: template picker + field toggles + QR/logo + live thermal preview.

'use client';

import { RECEIPT_TEMPLATES } from '@/types/settings.types';
import { ReceiptPreview } from '@/pos_modules/orders/printing-facility';
import { Field, inputCls, selectCls, checkboxCls, SectionHeading, type SectionProps } from './shared';

const TOGGLE_GROUPS = [
  ['Business / Header', [
    ['showLogo', 'Logo'], ['showBusinessName', 'Business name'], ['showAddress', 'Address'],
    ['showPhone', 'Phone'], ['showEmail', 'Email'], ['showWebsite', 'Website'], ['showTaxId', 'Tax ID'],
  ]],
  ['Order Info', [
    ['showOrderNumber', 'Order number'], ['showDateTime', 'Date & time'], ['showTable', 'Table'],
    ['showServer', 'Server'], ['showCustomer', 'Customer'], ['showOrderMode', 'Order mode'],
  ]],
  ['Items', [['showUnitPrice', 'Unit price'], ['showItemModifiers', 'Modifiers'], ['showItemNotes', 'Item notes']]],
  ['Totals', [['showTaxBreakdown', 'Tax breakdown'], ['showDiscount', 'Discount'], ['showServiceCharge', 'Service charge'], ['showTip', 'Tip']]],
  ['Payment', [['showPaymentMethod', 'Payment method'], ['showAmountPaid', 'Amount paid'], ['showChange', 'Change']]],
  ['Footer', [['showFooterMessage', 'Footer message'], ['showThankYou', 'Thank-you line'], ['showPoweredBy', 'Powered-by line']]],
] as const;

export default function ReceiptSection({ settings, update }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionHeading title="Receipt Printing" subtitle="Choose a template, toggle fields, and preview the exact thermal output." />

      <div className="grid lg:grid-cols-[1fr_auto] gap-6">
        {/* Controls */}
        <div className="space-y-5 min-w-0">
          {/* Template picker */}
          <div>
            <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">Template</h4>
            <div className="grid grid-cols-2 gap-2">
              {RECEIPT_TEMPLATES.map((t) => {
                const active = settings.receipt.template === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => update('receipt.template', t.id)}
                    className={`text-left p-3 rounded-lg border transition-colors ${active ? 'border-orange-400/60 bg-orange-400/10' : 'border-white/[0.08] bg-[#111] hover:bg-white/[0.04]'}`}
                  >
                    <div className={`text-sm font-semibold ${active ? 'text-orange-300' : 'text-white'}`}>{t.label}</div>
                    <div className="text-[11px] text-[#777] mt-0.5 leading-snug">{t.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paper + text */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Paper Width">
              <select className={selectCls} value={settings.receipt.paperWidth} onChange={(e) => update('receipt.paperWidth', e.target.value)}>
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            </Field>
            <Field label="Header Text">
              <input className={inputCls} value={settings.receipt.headerText || ''} onChange={(e) => update('receipt.headerText', e.target.value)} />
            </Field>
            <Field label="Footer Text">
              <input className={inputCls} value={settings.receipt.footerText || ''} onChange={(e) => update('receipt.footerText', e.target.value)} />
            </Field>
          </div>

          {/* Exact character width — dial in if the print wraps / misaligns vs preview */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Chars / line (advanced)">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={64}
                value={settings.receipt.printCharWidth || 0}
                onChange={(e) => update('receipt.printCharWidth', parseInt(e.target.value) || 0)}
                placeholder="0 = auto"
              />
            </Field>
            <div className="col-span-2 flex items-end">
              <p className="text-[11px] text-[#666] leading-snug pb-2">
                0 = auto ({settings.receipt.paperWidth === '58mm' ? '32' : '40'} for {settings.receipt.paperWidth}, a safe fit). If the divider still wraps to a
                second line, lower it a couple more; if there’s a big right margin and your printer supports it, raise it (up to ~48). The preview matches the print.
              </p>
            </div>
          </div>

          {/* Field toggles */}
          {TOGGLE_GROUPS.map(([group, keys]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">{group}</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-0.5">
                {keys.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={Boolean((settings.receipt as unknown as Record<string, unknown>)[key])}
                      onChange={(e) => update(`receipt.${key}`, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* QR */}
          <div>
            <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-1.5">QR Code</h4>
            <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer mb-2">
              <input type="checkbox" className={checkboxCls} checked={settings.receipt.qrEnabled} onChange={(e) => update('receipt.qrEnabled', e.target.checked)} />
              Print a QR code
            </label>
            {settings.receipt.qrEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <Field label="QR Content">
                  <select className={selectCls} value={settings.receipt.qrContent} onChange={(e) => update('receipt.qrContent', e.target.value)}>
                    <option value="order_number">Order number</option>
                    <option value="custom">Custom value / URL</option>
                  </select>
                </Field>
                {settings.receipt.qrContent === 'custom' && (
                  <Field label="Custom Value">
                    <input className={inputCls} value={settings.receipt.qrCustomValue || ''} onChange={(e) => update('receipt.qrCustomValue', e.target.value)} placeholder="https://..." />
                  </Field>
                )}
              </div>
            )}
          </div>

          {settings.receipt.showLogo && !settings.logoUrl && (
            <p className="text-[11px] text-amber-300/80">Logo is enabled but none is uploaded yet — add one in the Business section.</p>
          )}
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider mb-2 text-center">Live Preview</h4>
          <ReceiptPreview settings={settings as never} />
        </div>
      </div>
    </div>
  );
}
