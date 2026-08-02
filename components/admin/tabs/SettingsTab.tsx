// components/admin/tabs/SettingsTab.tsx
// Settings shell: owns fetch/save/update + a left sub-nav that swaps section panels.

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save, RefreshCw, CheckCircle, AlertCircle,
  Building2, DollarSign, Percent, Receipt, CreditCard, Clock, Monitor, MapPinned,
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '@/types/settings.types';
import type { SettingsData } from './settings/shared';
import BusinessSection from './settings/BusinessSection';
import CurrencySection from './settings/CurrencySection';
import TaxServiceSection from './settings/TaxServiceSection';
import ReceiptSection from './settings/ReceiptSection';
import PaymentsSection from './settings/PaymentsSection';
import OperationalSection from './settings/OperationalSection';
import HubSection from './settings/HubSection';
import ZonesSection from './settings/ZonesSection';

type SectionId = 'business' | 'currency' | 'tax' | 'receipt' | 'payments' | 'operational' | 'hub' | 'zones';

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: 'business', label: 'Business', icon: <Building2 size={15} /> },
  { id: 'currency', label: 'Currency & Locale', icon: <DollarSign size={15} /> },
  { id: 'tax', label: 'Tax & Service', icon: <Percent size={15} /> },
  { id: 'receipt', label: 'Receipt', icon: <Receipt size={15} /> },
  { id: 'payments', label: 'Payment Methods', icon: <CreditCard size={15} /> },
  { id: 'operational', label: 'Operational', icon: <Clock size={15} /> },
  { id: 'hub', label: 'Hub', icon: <Monitor size={15} /> },
  { id: 'zones', label: 'Zones', icon: <MapPinned size={15} /> },
];

export default function SettingsTab() {
  const [settings, setSettings] = useState<SettingsData>({ ...DEFAULT_SETTINGS });
  const [section, setSection] = useState<SectionId>('business');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = useCallback((t: { type: 'success' | 'error'; msg: string }) => {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        // Merge with defaults so any newly-added fields are always present.
        setSettings(() => ({
          ...DEFAULT_SETTINGS,
          ...data,
          businessAddress: { ...DEFAULT_SETTINGS.businessAddress, ...data?.businessAddress },
          tax: { ...DEFAULT_SETTINGS.tax, ...data?.tax },
          serviceCharge: { ...DEFAULT_SETTINGS.serviceCharge, ...data?.serviceCharge },
          receipt: { ...DEFAULT_SETTINGS.receipt, ...data?.receipt },
          hub: { ...DEFAULT_SETTINGS.hub, ...data?.hub },
          paymentMethods: Array.isArray(data?.paymentMethods) && data.paymentMethods.length > 0
            ? data.paymentMethods
            : DEFAULT_SETTINGS.paymentMethods.map((m) => ({ ...m })),
        }));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setToast(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showToast({ type: 'success', msg: 'Settings saved' });
      } else {
        const data = await res.json().catch(() => ({}));
        showToast({ type: 'error', msg: data.message || 'Failed to save settings' });
      }
    } catch {
      showToast({ type: 'error', msg: 'Network error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Path-based updater: update('receipt.showLogo', true), update('logoUrl', url).
  const update = useCallback((path: string, value: unknown) => {
    setSettings((prev) => {
      const copy = structuredClone(prev);
      const keys = path.split('.');
      let target: Record<string, unknown> = copy as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]] as Record<string, unknown>;
      target[keys[keys.length - 1]] = value;
      return copy;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Restaurant Settings</h2>
        <div className="flex items-center gap-2">
          <button onClick={fetchSettings} className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.06] text-[#888] hover:text-white hover:bg-white/[0.1] rounded-lg text-sm transition-colors">
            <RefreshCw size={14} /> Reload
          </button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1.5 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            <Save size={14} /> {isSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-300' : 'bg-red-500/15 border border-red-500/25 text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Two-pane: section menu + active panel */}
      <div className="flex gap-6 items-start">
        <nav className="w-48 shrink-0 space-y-0.5 sticky top-4">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-[#888] hover:text-white hover:bg-white/[0.04]'}`}
              >
                <span className={`shrink-0 ${active ? 'opacity-100' : 'opacity-50'}`}>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 rounded-xl border border-white/[0.08] bg-black/40 p-5">
          {section === 'business' && <BusinessSection settings={settings} update={update} />}
          {section === 'currency' && <CurrencySection settings={settings} update={update} />}
          {section === 'tax' && <TaxServiceSection settings={settings} update={update} />}
          {section === 'receipt' && <ReceiptSection settings={settings} update={update} />}
          {section === 'payments' && <PaymentsSection settings={settings} update={update} />}
          {section === 'operational' && <OperationalSection settings={settings} update={update} />}
          {section === 'hub' && <HubSection settings={settings} update={update} />}
          {section === 'zones' && <ZonesSection onToast={showToast} />}
        </div>
      </div>
    </div>
  );
}
