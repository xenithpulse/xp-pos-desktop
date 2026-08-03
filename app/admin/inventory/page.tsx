// app/admin/inventory/page.tsx
// Inventory Control Center — dedicated management surface for stock, purchases,
// reports, analytics, and the inventory capital position.

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  FileText,
  BarChart3,
  ArrowLeft,
  Warehouse,
} from 'lucide-react';

import OverviewTab from '@/components/admin/inventory/OverviewTab';
import StockTab from '@/components/admin/inventory/StockTab';
import TransactionsTab from '@/components/admin/inventory/TransactionsTab';
import ReportsTab from '@/components/admin/inventory/ReportsTab';
import AnalyticsTab from '@/components/admin/inventory/AnalyticsTab';

type InvTab = 'overview' | 'stock' | 'transactions' | 'reports' | 'analytics';

const TABS: { id: InvTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
  { id: 'stock', label: 'Stock', icon: <Boxes size={16} /> },
  { id: 'transactions', label: 'Transactions', icon: <ArrowLeftRight size={16} /> },
  { id: 'reports', label: 'Reports', icon: <FileText size={16} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
];

export default function InventoryControlCenterPage() {
  const [activeTab, setActiveTab] = useState<InvTab>('overview');
  const validTabs = TABS.map((t) => t.id) as InvTab[];

  useEffect(() => {
    const newHash = `#${activeTab}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeTab]);

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace('#', '') as InvTab;
      if (hash && validTabs.includes(hash)) setActiveTab(hash);
    };
    readHash();
    window.addEventListener('popstate', readHash);
    return () => window.removeEventListener('popstate', readHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTab = useCallback((tab: InvTab) => {
    setActiveTab(tab);
    window.history.pushState(null, '', `#${tab}`);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="sticky top-0 z-40 flex w-full shrink-0 flex-col border-b border-white/[0.08] bg-black md:h-screen md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.08]">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white text-black">
            <Warehouse size={14} strokeWidth={2} />
          </div>
          <h1 className="text-[14px] font-semibold tracking-[-0.01em]">Inventory</h1>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-1 md:flex-col md:space-y-0.5 md:overflow-y-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors md:w-full ${
                  isActive ? 'bg-white/[0.08] text-white' : 'text-[#888] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-50'}`}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/[0.08] p-3 md:block">
          <Link
            href="/admin/manage#ingredients"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-[#888] hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <ArrowLeft size={15} />
            <span>Back to Admin</span>
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-8 md:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {activeTab === 'overview' && <OverviewTab onGoToStock={() => switchTab('stock')} />}
            {activeTab === 'stock' && <StockTab />}
            {activeTab === 'transactions' && <TransactionsTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'analytics' && <AnalyticsTab />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
