// components/admin/tabs/settings/shared.tsx
// Shared primitives + types for the Settings section panels.

'use client';

import React from 'react';
import type { DEFAULT_SETTINGS } from '@/types/settings.types';

/** The editable settings shape held by the Settings shell. */
export type SettingsData = typeof DEFAULT_SETTINGS;

/** Every section panel receives the live settings + a path-based updater. */
export interface SectionProps {
  settings: SettingsData;
  update: (path: string, value: unknown) => void;
}

export const inputCls =
  'w-full px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder-[#555] focus:outline-none focus:border-white/20 transition-colors';
export const selectCls = inputCls;
export const checkboxCls =
  'w-4 h-4 rounded border-white/20 bg-[#111] text-white focus:ring-white/20 focus:ring-offset-0 focus:ring-1';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[#888] uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

/** A labelled group of checkboxes bound to `settings.<prefix>.<key>`. */
export function ToggleGrid({
  settings,
  update,
  prefix,
  items,
  cols = 2,
}: SectionProps & { prefix: string; items: readonly (readonly [string, string])[]; cols?: number }) {
  return (
    <div className={`grid gap-x-4 gap-y-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {items.map(([key, label]) => {
        const obj = (settings as unknown as Record<string, Record<string, unknown>>)[prefix];
        return (
          <label key={key} className="flex items-center gap-2 text-sm text-[#ccc] cursor-pointer">
            <input
              type="checkbox"
              className={checkboxCls}
              checked={Boolean(obj?.[key])}
              onChange={(e) => update(`${prefix}.${key}`, e.target.checked)}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

/** Section header shown above each panel. */
export function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-xs text-[#666] mt-0.5">{subtitle}</p>}
    </div>
  );
}
