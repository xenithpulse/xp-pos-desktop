// components/admin/tabs/settings/ZonesSection.tsx
// Floor-plan zones/sections CRUD. Self-contained (fetches its own zones).

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { inputCls, SectionHeading } from './shared';

interface Zone {
  _id: string;
  name: string;
  color?: string;
  floorLevel?: number;
}

export default function ZonesSection({ onToast }: { onToast: (t: { type: 'success' | 'error'; msg: string }) => void }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#666666', floorLevel: 0 });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables/sections');
      if (res.ok) {
        const data = await res.json();
        setZones(data.sections || []);
      }
    } catch (err) {
      console.error('Failed to fetch zones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/tables/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), color: form.color, floorNumber: form.floorLevel }),
      });
      if (res.ok) {
        setForm({ name: '', color: '#666666', floorLevel: 0 });
        onToast({ type: 'success', msg: 'Zone created' });
        fetchZones();
      } else {
        const data = await res.json().catch(() => ({}));
        onToast({ type: 'error', msg: data.error || 'Failed to create zone' });
      }
    } catch {
      onToast({ type: 'error', msg: 'Network error creating zone' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tables/sections/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onToast({ type: 'success', msg: 'Zone deleted' });
        fetchZones();
      } else {
        const data = await res.json().catch(() => ({}));
        onToast({ type: 'error', msg: data.error || 'Failed to delete zone' });
      }
    } catch {
      onToast({ type: 'error', msg: 'Network error deleting zone' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeading title="Zones / Sections" subtitle="Organize the floor plan. Assign tables to zones from the Tables tab." />

      <div className="flex items-end gap-3 pb-4 border-b border-white/[0.06]">
        <div className="flex-1">
          <span className="text-xs font-medium text-[#888] uppercase tracking-wider block mb-1">Zone Name</span>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Main Hall, Terrace, VIP"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <div className="w-20">
          <span className="text-xs font-medium text-[#888] uppercase tracking-wider block mb-1">Color</span>
          <input type="color" className="w-full h-[38px] rounded-lg border border-white/[0.08] bg-[#111] cursor-pointer" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
        </div>
        <div className="w-20">
          <span className="text-xs font-medium text-[#888] uppercase tracking-wider block mb-1">Floor</span>
          <input className={inputCls} type="number" min={0} value={form.floorLevel} onChange={(e) => setForm((f) => ({ ...f, floorLevel: parseInt(e.target.value) || 0 }))} />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 h-[38px] bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : zones.length === 0 ? (
        <p className="text-sm text-[#555] text-center py-6">No zones yet. Add your first zone above.</p>
      ) : (
        <div className="space-y-2">
          {zones.map((zone) => (
            <div key={zone._id} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zone.color || '#666' }} />
                <span className="text-sm text-white font-medium">{zone.name}</span>
                {zone.floorLevel !== undefined && zone.floorLevel > 0 && <span className="text-xs text-[#555]">Floor {zone.floorLevel}</span>}
              </div>
              <button
                onClick={() => handleDelete(zone._id)}
                disabled={deletingId === zone._id}
                className="p-1.5 text-[#555] hover:text-red-400 hover:bg-white/[0.06] rounded-md transition-colors disabled:opacity-40"
                title="Delete zone"
              >
                {deletingId === zone._id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
