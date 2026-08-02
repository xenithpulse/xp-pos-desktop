// components/admin/tabs/TablesListTab.tsx
// Tables list view with zone management, search, filter, and actions

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  LayoutGrid,
  Users,
  RefreshCw,
  ArrowRightLeft,
  MapPin,
} from 'lucide-react';
import { ITable, TableStatus, TABLE_STATUS_LABELS, TABLE_SHAPE_LABELS } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TablesListTabProps {
  onEdit: (id: string, data: Record<string, unknown>) => void;
  onCreate: () => void;
}

interface ISection {
  _id: string;
  name: string;
  color?: string;
  floorLevel?: number;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge Colors
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  occupied: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  reserved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cleaning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TablesListTab({ onEdit, onCreate }: TablesListTabProps) {
  const [tables, setTables] = useState<ITable[]>([]);
  const [sections, setSections] = useState<ISection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TableStatus | 'all'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [shiftingTable, setShiftingTable] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch
  // ─────────────────────────────────────────────────────────────────────────

  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/tables');
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || data);
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch('/api/tables/sections');
      if (res.ok) {
        const data = await res.json();
        setSections(data.sections || []);
      }
    } catch (error) {
      console.error('Failed to fetch sections:', error);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    fetchSections();
  }, [fetchTables, fetchSections]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTables((prev) => prev.filter((t) => t._id !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Shift Zone Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleShiftZone = async (tableId: string, newSectionId: string) => {
    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: newSectionId }),
      });
      if (res.ok) {
        const section = sections.find((s) => s._id === newSectionId);
        setTables((prev) =>
          prev.map((t) =>
            t._id === tableId
              ? { ...t, sectionId: newSectionId, sectionName: section?.name }
              : t
          )
        );
      }
    } catch (error) {
      console.error('Failed to shift zone:', error);
    } finally {
      setShiftingTable(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const getSectionName = (table: ITable) => {
    if (table.sectionName) return table.sectionName;
    const section = sections.find((s) => s._id === table.sectionId);
    return section?.name || 'Unassigned';
  };

  const getSectionColor = (table: ITable) => {
    const section = sections.find((s) => s._id === table.sectionId);
    return section?.color || '#666';
  };

  const filteredTables = tables.filter((table) => {
    const matchesSearch =
      !searchQuery ||
      table.tableNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      table.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || table.status === statusFilter;
    const matchesZone =
      zoneFilter === 'all' ||
      (zoneFilter === 'unassigned' ? !table.sectionId : table.sectionId === zoneFilter);
    return matchesSearch && matchesStatus && matchesZone;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Tables</h2>
          <p className="text-[#888] text-sm">
            Manage restaurant tables and seating layout
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Table
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tables..."
            className="w-full pl-9 pr-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-white/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TableStatus | 'all')}
          className="px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
        >
          <option value="all">All Status</option>
          {Object.entries(TABLE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
        >
          <option value="all">All Zones</option>
          <option value="unassigned">Unassigned</option>
          {sections.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={() => { fetchTables(); fetchSections(); }}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="text-center py-12 text-[#555]">
          <LayoutGrid className="mx-auto mb-3" size={48} />
          <p>No tables found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTables.map((table, index) => (
            <motion.div
              key={table._id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="bg-[#111] border border-white/[0.08] rounded-xl p-4 hover:border-white/[0.15] transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-white">{table.tableNumber}</h3>
                  {table.name && <p className="text-[#888] text-sm">{table.name}</p>}
                </div>
                <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${STATUS_COLORS[table.status]}`}>
                  {TABLE_STATUS_LABELS[table.status]}
                </span>
              </div>

              {/* Zone Badge */}
              <div className="flex items-center gap-1.5 mb-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getSectionColor(table) }}
                />
                <span className="text-xs text-[#888]">{getSectionName(table)}</span>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-sm text-[#666] mb-4">
                <div className="flex items-center gap-2">
                  <Users size={13} />
                  <span>{table.capacity} seats (min {table.minCovers})</span>
                </div>
                <div className="flex items-center gap-2">
                  <LayoutGrid size={13} />
                  <span>{TABLE_SHAPE_LABELS[table.shape]}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(table._id, table as unknown as Record<string, unknown>)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg text-sm text-[#ccc] transition-colors"
                >
                  <Edit2 size={13} />
                  Edit
                </button>

                {/* Shift Zone */}
                {sections.length > 0 && (
                  shiftingTable === table._id ? (
                    <select
                      autoFocus
                      className="px-2 py-1.5 bg-[#111] border border-white/[0.15] rounded-lg text-sm text-white focus:outline-none"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleShiftZone(table._id, e.target.value);
                        else setShiftingTable(null);
                      }}
                      onBlur={() => setShiftingTable(null)}
                    >
                      <option value="">Zone…</option>
                      {sections.filter((s) => s._id !== table.sectionId).map((s) => (
                        <option key={s._id} value={s._id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setShiftingTable(table._id)}
                      className="px-2 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg text-sm text-[#888] transition-colors"
                      title="Shift Zone"
                    >
                      <ArrowRightLeft size={13} />
                    </button>
                  )
                )}

                {deleteConfirm === table._id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(table._id)}
                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-xs text-white transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-[#ccc] transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(table._id)}
                    className="px-2 py-1.5 bg-white/[0.06] hover:bg-red-600/80 border border-white/[0.08] rounded-lg text-sm text-[#888] hover:text-white transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-[#555] border-t border-white/[0.06] pt-4">
        <span>Total: {tables.length}</span>
        <span>Available: {tables.filter((t) => t.status === 'available').length}</span>
        <span>Occupied: {tables.filter((t) => t.status === 'occupied').length}</span>
      </div>
    </div>
  );
}
