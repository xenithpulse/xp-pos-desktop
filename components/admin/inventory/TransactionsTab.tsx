// components/admin/inventory/TransactionsTab.tsx
// Unified stock-movement ledger across all items.

'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowLeftRight, ArrowUp, ArrowDown } from 'lucide-react';
import type { DeltaReason } from '@/models/schemas/ingredient.schema';
import { REASON_LABELS, REASON_CHIP, timeAgo, money2 } from './shared';

interface Txn {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  reason: DeltaReason;
  unitCost?: number;
  balanceAfter?: number;
  note?: string;
  at: string;
}

const REASON_OPTIONS: { v: string; l: string }[] = [
  { v: '', l: 'All reasons' },
  { v: 'restock', l: 'Restock' },
  { v: 'order_deduction', l: 'Order Deduction' },
  { v: 'waste', l: 'Waste' },
  { v: 'stock_take', l: 'Stock-take' },
  { v: 'manual_adjustment', l: 'Adjustment' },
  { v: 'return', l: 'Return' },
  { v: 'transfer', l: 'Transfer' },
];

const DAYS_OPTIONS = [
  { v: '7', l: '7 days' },
  { v: '30', l: '30 days' },
  { v: '90', l: '90 days' },
  { v: '0', l: 'All time' },
];

export default function TransactionsTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('30');

  const fetchTxns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (reason) params.set('reason', reason);
      if (days !== '0') params.set('days', days);
      const res = await fetch(`/api/inventory/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTxns(data.transactions || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load transactions:', e);
    } finally {
      setIsLoading(false);
    }
  }, [reason, days]);

  useEffect(() => {
    fetchTxns();
  }, [fetchTxns]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ArrowLeftRight size={18} /> Transactions
          </h2>
          <p className="text-[#888] text-sm">{total} movements in range · showing {txns.length}</p>
        </div>
        <div className="flex gap-2">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="bg-[#111] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20">
            {REASON_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select value={days} onChange={(e) => setDays(e.target.value)} className="bg-[#111] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20">
            {DAYS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <button onClick={fetchTxns} className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : txns.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <ArrowLeftRight className="mx-auto mb-3" size={44} />
          <p>No transactions in this range</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left">
            <thead className="bg-[#111] text-[#666] text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Change</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-right">Unit ₨</th>
                <th className="px-4 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {txns.map((t, idx) => {
                const positive = t.qty > 0;
                return (
                  <tr key={idx} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{timeAgo(t.at)}</td>
                    <td className="px-4 py-3 text-sm text-white">{t.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-[11px] rounded-full ${REASON_CHIP[t.reason]}`}>{REASON_LABELS[t.reason]}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-sm ${positive ? 'text-green-400' : 'text-red-400'}`}>
                      <span className="inline-flex items-center gap-0.5">
                        {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                        {positive ? '+' : ''}{t.qty} <span className="text-[#666] text-[10px]">{t.unit}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#bbb]">
                      {t.balanceAfter != null ? `${t.balanceAfter} ${t.unit}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[#bbb]">
                      {t.unitCost != null ? money2(t.unitCost) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#777] max-w-[220px] truncate">{t.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
