// components/admin/tabs/settings/PaymentsSection.tsx
// Fully configurable payment methods: add/rename/icon/category/reorder/toggle/delete.
// The POS payment drawer + quick-complete render exactly the enabled methods here.

'use client';

import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import type { IPaymentMethodConfig, PaymentCategory } from '@/types/settings.types';
import { inputCls, selectCls, checkboxCls, SectionHeading, type SectionProps } from './shared';

const CATEGORIES: { value: PaymentCategory; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online / Transfer' },
  { value: 'other', label: 'Other' },
];

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'method';
}

export default function PaymentsSection({ settings, update }: SectionProps) {
  const methods = [...(settings.paymentMethods || [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const commit = (next: IPaymentMethodConfig[]) => {
    // Re-number sortOrder to match array order.
    update('paymentMethods', next.map((m, i) => ({ ...m, sortOrder: i })));
  };

  const patch = (id: string, changes: Partial<IPaymentMethodConfig>) =>
    commit(methods.map((m) => (m.id === id ? { ...m, ...changes } : m)));

  const addMethod = () => {
    const existing = new Set(methods.map((m) => m.id));
    let id = 'custom_method';
    let n = 1;
    while (existing.has(id)) id = `custom_method_${++n}`;
    commit([...methods, { id, label: 'New Method', icon: '•', category: 'other', enabled: true, requiresReference: false, sortOrder: methods.length, isBuiltIn: false }]);
  };

  const rename = (id: string, label: string, isBuiltIn?: boolean) => {
    // Custom methods keep id in sync with the label slug (until it collides);
    // built-ins keep their stable id.
    if (isBuiltIn) { patch(id, { label }); return; }
    const others = new Set(methods.filter((m) => m.id !== id).map((m) => m.id));
    let newId = slugify(label);
    if (others.has(newId)) newId = `${newId}_${Date.now().toString(36).slice(-3)}`;
    commit(methods.map((m) => (m.id === id ? { ...m, id: newId, label } : m)));
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= methods.length) return;
    const next = [...methods];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const remove = (id: string) => commit(methods.filter((m) => m.id !== id));

  const enabledCount = methods.filter((m) => m.enabled).length;

  return (
    <div className="space-y-4">
      <SectionHeading title="Payment Methods" subtitle="These appear in the POS payment drawer, in this order. Add your own (JazzCash, Meal Voucher, …)." />

      {enabledCount === 0 && (
        <p className="text-[11px] text-amber-300/80">At least one method should be enabled, or staff can’t record payments.</p>
      )}

      <div className="space-y-2">
        {methods.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-white/[0.08] bg-[#111]">
            {/* Reorder */}
            <div className="flex flex-col text-[#555]">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="hover:text-white disabled:opacity-20"><ChevronUp size={14} /></button>
              <button onClick={() => move(i, 1)} disabled={i === methods.length - 1} className="hover:text-white disabled:opacity-20"><ChevronDown size={14} /></button>
            </div>
            <GripVertical size={14} className="text-[#333] shrink-0" />

            {/* Icon */}
            <input
              className={inputCls + ' w-12 text-center px-1'}
              value={m.icon || ''}
              maxLength={2}
              onChange={(e) => patch(m.id, { icon: e.target.value })}
              title="Emoji / glyph"
            />

            {/* Label */}
            <input
              className={inputCls + ' flex-1 min-w-0'}
              value={m.label}
              onChange={(e) => rename(m.id, e.target.value, m.isBuiltIn)}
              placeholder="Method name"
            />

            {/* Category */}
            <select className={selectCls + ' w-40'} value={m.category} onChange={(e) => patch(m.id, { category: e.target.value as PaymentCategory })} title="Reporting category">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            {/* Requires reference */}
            <label className="flex items-center gap-1.5 text-xs text-[#999] cursor-pointer whitespace-nowrap" title="Prompt for a reference / txn id">
              <input type="checkbox" className={checkboxCls} checked={m.requiresReference} onChange={(e) => patch(m.id, { requiresReference: e.target.checked })} />
              Ref
            </label>

            {/* Enabled */}
            <label className="flex items-center gap-1.5 text-xs text-[#ccc] cursor-pointer whitespace-nowrap">
              <input type="checkbox" className={checkboxCls} checked={m.enabled} onChange={(e) => patch(m.id, { enabled: e.target.checked })} />
              On
            </label>

            {/* Delete (custom only) */}
            <button
              onClick={() => remove(m.id)}
              disabled={m.isBuiltIn}
              className="p-1.5 text-[#555] hover:text-red-400 hover:bg-white/[0.06] rounded-md transition-colors disabled:opacity-20 disabled:hover:text-[#555] disabled:hover:bg-transparent"
              title={m.isBuiltIn ? 'Built-in methods can’t be deleted (toggle off instead)' : 'Delete method'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addMethod}
        className="inline-flex items-center gap-2 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-lg text-sm transition-colors"
      >
        <Plus size={14} /> Add method
      </button>
    </div>
  );
}
