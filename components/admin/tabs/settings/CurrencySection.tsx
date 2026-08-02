// components/admin/tabs/settings/CurrencySection.tsx
// Currency (any currency, symbol/decimals/placement/locale) + region timezone.

'use client';

import { useMemo } from 'react';
import { CURRENCY_OPTIONS, type SupportedCurrency } from '@/types/settings.types';
import { getGroupedTimezones } from '@/lib/timezones';
import { Field, inputCls, selectCls, SectionHeading, type SectionProps } from './shared';

export default function CurrencySection({ settings, update }: SectionProps) {
  const tzGroups = useMemo(() => getGroupedTimezones(), []);

  const handleCurrencyChange = (code: SupportedCurrency) => {
    const meta = CURRENCY_OPTIONS.find((c) => c.code === code);
    if (!meta) return;
    update('currency', meta.code);
    update('currencySymbol', meta.symbol);
    update('currencyLocale', meta.locale);
    update('currencyDecimals', meta.decimals);
    update('currencySymbolPosition', meta.position);
  };

  const preview = (() => {
    try {
      const n = (1234.5).toLocaleString(settings.currencyLocale || 'en-US', {
        minimumFractionDigits: settings.currencyDecimals ?? 2,
        maximumFractionDigits: settings.currencyDecimals ?? 2,
      });
      return settings.currencySymbolPosition === 'after' ? `${n} ${settings.currencySymbol}` : `${settings.currencySymbol}${n}`;
    } catch {
      return '—';
    }
  })();

  return (
    <div className="space-y-5">
      <SectionHeading title="Currency & Locale" subtitle="Works in any country — pick a currency to pre-fill, then fine-tune." />

      <div className="grid grid-cols-3 gap-4">
        <Field label="Currency">
          <select className={selectCls} value={settings.currency} onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}>
            {!CURRENCY_OPTIONS.some((c) => c.code === settings.currency) && (
              <option value={settings.currency}>{settings.currency} (custom)</option>
            )}
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} — {c.label} ({c.code})</option>
            ))}
          </select>
        </Field>
        <Field label="Currency Symbol">
          <input className={inputCls} value={settings.currencySymbol} onChange={(e) => update('currencySymbol', e.target.value)} placeholder="$" />
        </Field>
        <Field label="Symbol Position">
          <select className={selectCls} value={settings.currencySymbolPosition} onChange={(e) => update('currencySymbolPosition', e.target.value)}>
            <option value="before">Before amount ({settings.currencySymbol}100)</option>
            <option value="after">After amount (100 {settings.currencySymbol})</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Decimal Places">
          <input
            className={inputCls}
            type="number"
            min={0}
            max={4}
            value={settings.currencyDecimals}
            onChange={(e) => update('currencyDecimals', Math.max(0, Math.min(4, parseInt(e.target.value) || 0)))}
          />
        </Field>
        <Field label="Number Locale">
          <input className={inputCls} value={settings.currencyLocale} onChange={(e) => update('currencyLocale', e.target.value)} placeholder="en-US" />
        </Field>
        <Field label="Timezone">
          <select className={selectCls} value={settings.timezone} onChange={(e) => update('timezone', e.target.value)}>
            {settings.timezone && !tzGroups.some((g) => g.zones.some((z) => z.value === settings.timezone)) && (
              <option value={settings.timezone}>{settings.timezone}</option>
            )}
            {tzGroups.map((g) => (
              <optgroup key={g.region} label={g.region}>
                {g.zones.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wider">Preview</span>
        <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold tabular-nums">{preview}</span>
      </div>
    </div>
  );
}
