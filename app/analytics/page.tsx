'use client';

// app/analytics/page.tsx
// Tabbed analytics dashboard (super-admin only). Hash-based navigation:
//   #sales · #menu · #inventory · #finance
// Each tab lazy-loads its own data; the range selector is shared across tabs.

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Utensils, Boxes, Landmark, RefreshCw } from 'lucide-react';
import { useClientTz } from './_components/shared';
import SalesTab from './_components/SalesTab';
import MenuTab from './_components/MenuTab';
import InventoryTab from './_components/InventoryTab';
import FinanceTab from './_components/FinanceTab';

type TabId = 'sales' | 'menu' | 'inventory' | 'finance';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'sales', label: 'Sales', icon: <BarChart3 size={16} /> },
  { id: 'menu', label: 'Menu', icon: <Utensils size={16} /> },
  { id: 'inventory', label: 'Inventory', icon: <Boxes size={16} /> },
  { id: 'finance', label: 'Finance', icon: <Landmark size={16} /> },
];

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function tabFromHash(): TabId {
  if (typeof window === 'undefined') return 'sales';
  const h = window.location.hash.replace('#', '') as TabId;
  return TABS.some((t) => t.id === h) ? h : 'sales';
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>('sales');
  const [days, setDays] = useState(30);
  const [nonce, setNonce] = useState(0); // bump to force the active tab to refetch
  const tz = useClientTz();

  // Sync active tab ⇆ URL hash
  useEffect(() => {
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const selectTab = useCallback((id: TabId) => {
    if (window.location.hash.replace('#', '') !== id) {
      window.location.hash = id;
    }
    setTab(id);
  }, []);

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0];

  const renderTab = () => {
    const key = `${tab}-${days}-${nonce}`;
    const props = { days, tz, active: true };
    switch (tab) {
      case 'menu':
        return <MenuTab key={key} {...props} />;
      case 'inventory':
        return <InventoryTab key={key} {...props} />;
      case 'finance':
        return <FinanceTab key={key} {...props} />;
      case 'sales':
      default:
        return <SalesTab key={key} {...props} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab.label} overview · last {days} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === r.days ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setNonce((n) => n + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Analytics sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-cyan-500 text-cyan-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Active tab */}
      {renderTab()}
    </div>
  );
}
