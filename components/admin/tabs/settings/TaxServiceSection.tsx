// components/admin/tabs/settings/TaxServiceSection.tsx
// Tax configuration + service charge.

'use client';

import { Field, inputCls, checkboxCls, SectionHeading, type SectionProps } from './shared';

export default function TaxServiceSection({ settings, update }: SectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Tax & Service Charge" subtitle="Defaults applied to new orders." />

      {/* Tax */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider">Tax</h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label={`${settings.tax.taxLabel} Rate (%)`}>
            <input className={inputCls} type="number" min={0} max={100} step={0.5} value={settings.tax.taxRate} onChange={(e) => update('tax.taxRate', parseFloat(e.target.value) || 0)} />
          </Field>
          <Field label="Tax Label">
            <input className={inputCls} value={settings.tax.taxLabel} onChange={(e) => update('tax.taxLabel', e.target.value)} placeholder="GST" />
          </Field>
          <Field label="Registration #">
            <input className={inputCls} value={settings.tax.taxRegistrationNumber || ''} onChange={(e) => update('tax.taxRegistrationNumber', e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.tax.taxInclusive} onChange={(e) => update('tax.taxInclusive', e.target.checked)} />
          Prices are tax-inclusive
        </label>
      </div>

      {/* Service charge */}
      <div className="space-y-3 pt-2 border-t border-white/[0.06]">
        <h4 className="text-xs font-semibold text-[#888] uppercase tracking-wider">Service Charge</h4>
        <label className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
          <input type="checkbox" className={checkboxCls} checked={settings.serviceCharge.enabled} onChange={(e) => update('serviceCharge.enabled', e.target.checked)} />
          Enable service charge
        </label>
        {settings.serviceCharge.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Percentage (%)">
              <input className={inputCls} type="number" min={0} max={100} step={0.5} value={settings.serviceCharge.percentage} onChange={(e) => update('serviceCharge.percentage', parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label="Label">
              <input className={inputCls} value={settings.serviceCharge.label} onChange={(e) => update('serviceCharge.label', e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
