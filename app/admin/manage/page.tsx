// app/admin/manage/page.tsx
// Admin Management Dashboard - Tabbed interface for managing Tables, Menu, Categories, Ingredients

'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  UtensilsCrossed,
  FolderTree,
  Package,
  Plus,
  ArrowLeft,
  Settings,
  Users,
  Warehouse,
  ArrowUpRight,
} from 'lucide-react';

// Components
import TablesListTab from '@/components/admin/tabs/TablesListTab';
import MenuItemsListTab from '@/components/admin/tabs/MenuItemsListTab';
import CategoriesListTab from '@/components/admin/tabs/CategoriesListTab';
import IngredientsListTab from '@/components/admin/tabs/IngredientsListTab';
import AdminsListTab from '@/components/admin/tabs/AdminsListTab';
import FormsTab from '@/components/admin/tabs/FormsTab';
import SettingsTab from '@/components/admin/tabs/SettingsTab';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AdminTab = 'tables' | 'menu-items' | 'categories' | 'ingredients' | 'staff' | 'forms' | 'settings';
export type FormMode = 'create' | 'edit';
export type FormEntity = 'table' | 'menu-item' | 'category' | 'ingredient';

export interface FormTarget {
  entity: FormEntity;
  mode: FormMode;
  id?: string;
  data?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Configuration
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'tables', label: 'Tables', icon: <LayoutGrid size={16} /> },
  { id: 'menu-items', label: 'Menu Items', icon: <UtensilsCrossed size={16} /> },
  { id: 'categories', label: 'Categories', icon: <FolderTree size={16} /> },
  { id: 'ingredients', label: 'Ingredients', icon: <Package size={16} /> },
  { id: 'staff', label: 'Staff', icon: <Users size={16} /> },
  { id: 'forms', label: 'Add / Edit', icon: <Plus size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminManagePage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('tables');
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // Hash-based Tab Routing
  // ─────────────────────────────────────────────────────────────────────────

  const validTabs = TABS.map((t) => t.id) as AdminTab[];

  // Sync tab → hash
  useEffect(() => {
    const newHash = `#${activeTab}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', newHash);
    }
  }, [activeTab]);

  // Read hash on mount & listen for popstate (back/forward)
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace('#', '') as AdminTab;
      if (hash && validTabs.includes(hash)) {
        setActiveTab(hash);
      }
    };
    readHash();
    window.addEventListener('popstate', readHash);
    return () => window.removeEventListener('popstate', readHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push history entry on tab click (so back button works)
  const switchTab = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    window.history.pushState(null, '', `#${tab}`);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleEdit = useCallback((entity: FormEntity, id: string, data?: Record<string, unknown>) => {
    setFormTarget({ entity, mode: 'edit', id, data });
    switchTab('forms');
  }, [switchTab]);

  const handleCreate = useCallback((entity: FormEntity) => {
    setFormTarget({ entity, mode: 'create' });
    switchTab('forms');
  }, [switchTab]);

  const handleFormSuccess = useCallback(() => {
    if (formTarget) {
      const tabMap: Record<FormEntity, AdminTab> = {
        table: 'tables',
        'menu-item': 'menu-items',
        category: 'categories',
        ingredient: 'ingredients',
      };
      switchTab(tabMap[formTarget.entity]);
    }
    setFormTarget(null);
    setRefreshKey((k) => k + 1);
  }, [formTarget, switchTab]);

  const handleBackToList = useCallback(() => {
    if (formTarget) {
      const tabMap: Record<FormEntity, AdminTab> = {
        table: 'tables',
        'menu-item': 'menu-items',
        category: 'categories',
        ingredient: 'ingredients',
      };
      switchTab(tabMap[formTarget.entity]);
      setFormTarget(null);
    }
  }, [formTarget, switchTab]);

  // Clear form target when switching away from forms tab
  useEffect(() => {
    if (activeTab !== 'forms') {
      setFormTarget(null);
    }
  }, [activeTab]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Left Sidebar — Vercel-style vertical nav */}
      <aside className="sticky top-0 h-screen w-56 shrink-0 border-r border-white/[0.08] bg-black flex flex-col z-40">
        {/* Logo / Title */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.08]">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white text-black">
            <Settings size={14} strokeWidth={2} />
          </div>
          <h1 className="text-[14px] font-semibold tracking-[-0.01em]">Admin</h1>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                  transition-colors
                  ${isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-[#888] hover:text-white hover:bg-white/[0.04]'
                  }
                `}
              >
                <span className={`shrink-0 ${isActive ? 'opacity-100' : 'opacity-50'}`}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* External link to the full Inventory Control Center */}
          <Link
            href="/admin/inventory"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[#888] hover:text-white hover:bg-white/[0.04] transition-colors mt-1"
          >
            <span className="shrink-0 opacity-50"><Warehouse size={16} /></span>
            <span>Inventory</span>
            <ArrowUpRight size={13} className="ml-auto opacity-40" />
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 py-8 px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {activeTab === 'tables' && (
              <TablesListTab
                key={`tables-${refreshKey}`}
                onEdit={(id: string, data: Record<string, unknown>) => handleEdit('table', id, data)}
                onCreate={() => handleCreate('table')}
              />
            )}

            {activeTab === 'menu-items' && (
              <MenuItemsListTab
                key={`menu-items-${refreshKey}`}
                onEdit={(id: string, data: Record<string, unknown>) => handleEdit('menu-item', id, data)}
                onCreate={() => handleCreate('menu-item')}
              />
            )}

            {activeTab === 'categories' && (
              <CategoriesListTab
                key={`categories-${refreshKey}`}
                onEdit={(id: string, data: Record<string, unknown>) => handleEdit('category', id, data)}
                onCreate={() => handleCreate('category')}
              />
            )}

            {activeTab === 'ingredients' && (
              <IngredientsListTab
                key={`ingredients-${refreshKey}`}
                onEdit={(id: string, data: Record<string, unknown>) => handleEdit('ingredient', id, data)}
                onCreate={() => handleCreate('ingredient')}
              />
            )}

            {activeTab === 'staff' && (
              <AdminsListTab key={`staff-${refreshKey}`} />
            )}

            {activeTab === 'settings' && (
              <SettingsTab />
            )}

            {activeTab === 'forms' && (
              <div>
                {formTarget ? (
                  <div>
                    <button
                      onClick={handleBackToList}
                      className="inline-flex items-center gap-2 text-[13px] text-[#888] hover:text-white mb-6 transition-colors"
                    >
                      <ArrowLeft size={14} />
                      <span>Back to list</span>
                    </button>
                    <FormsTab
                      target={formTarget}
                      onSuccess={handleFormSuccess}
                      onCancel={handleBackToList}
                    />
                  </div>
                ) : (
                  <FormsTab
                    target={null}
                    onSuccess={handleFormSuccess}
                    onCancel={() => switchTab('tables')}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
