// components/admin/inventory/ReportsTab.tsx
// Printable inventory reports (Low Stock, Valuation, Consumption) with
// user-appended custom line items. Uses react-to-print v3.

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Plus, Trash2, FileText, RefreshCw } from 'lucide-react';
import {
  IIngredient,
  money,
  money2,
  itemValue,
  unitValue,
  stockStatus,
  STATUS_META,
} from './shared';

type ReportType = 'low_stock' | 'valuation' | 'consumption';

const REPORTS: { id: ReportType; label: string; desc: string }[] = [
  { id: 'valuation', label: 'Stock Valuation', desc: 'Every item, quantity, unit cost and total value' },
  { id: 'low_stock', label: 'Low Stock', desc: 'Items at or below their reorder threshold' },
  { id: 'consumption', label: 'Consumption', desc: 'Total consumed and restocked per item' },
];

interface CustomLine {
  id: string;
  label: string;
  qty: string;
  amount: string;
}

export default function ReportsTab() {
  const [items, setItems] = useState<IIngredient[]>([]);
  const [cashInHand, setCashInHand] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [report, setReport] = useState<ReportType>('valuation');
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ingRes, cfgRes] = await Promise.all([
        fetch('/api/ingredients?limit=1000'),
        fetch('/api/inventory/config'),
      ]);
      if (ingRes.ok) setItems((await ingRes.json()).ingredients || []);
      if (cfgRes.ok) setCashInHand((await cfgRes.json()).cashInHand ?? 0);
    } catch (e) {
      console.error('Failed to load report data:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `inventory-${report}-${new Date().toISOString().slice(0, 10)}`,
  });

  const addLine = () => setCustomLines((l) => [...l, { id: crypto.randomUUID(), label: '', qty: '', amount: '' }]);
  const removeLine = (id: string) => setCustomLines((l) => l.filter((x) => x.id !== id));
  const updateLine = (id: string, k: keyof CustomLine, v: string) =>
    setCustomLines((l) => l.map((x) => (x.id === id ? { ...x, [k]: v } : x)));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText size={18} /> Reports
          </h2>
          <p className="text-[#888] text-sm">Generate and print inventory reports</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Report selector */}
      <div className="grid gap-3 sm:grid-cols-3">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReport(r.id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              report === r.id ? 'bg-white/[0.08] border-white/[0.2]' : 'bg-[#111] border-white/[0.06] hover:border-white/[0.15]'
            }`}
          >
            <div className="text-sm font-medium text-white">{r.label}</div>
            <div className="text-[11px] text-[#666] mt-0.5">{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Custom lines editor */}
      <div className="bg-[#111] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Custom Report Lines</h3>
          <button onClick={addLine} className="flex items-center gap-1 text-xs text-[#888] hover:text-white">
            <Plus size={13} /> Add line
          </button>
        </div>
        {customLines.length === 0 ? (
          <p className="text-xs text-[#555]">Add manual lines (opening counts, misc costs, corrections) to appear on the printed report.</p>
        ) : (
          <div className="space-y-2">
            {customLines.map((line) => (
              <div key={line.id} className="flex gap-2">
                <input value={line.label} onChange={(e) => updateLine(line.id, 'label', e.target.value)} placeholder="Description" className="flex-1 bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/30" />
                <input value={line.qty} onChange={(e) => updateLine(line.id, 'qty', e.target.value)} placeholder="Qty" className="w-24 bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/30" />
                <input value={line.amount} onChange={(e) => updateLine(line.id, 'amount', e.target.value)} placeholder="Amount ₨" className="w-28 bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-white/30" />
                <button onClick={() => removeLine(line.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview / printable area */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-white">
          <div ref={printRef} className="report-print bg-white text-black p-8">
            <ReportBody report={report} items={items} customLines={customLines} cashInHand={cashInHand} />
          </div>
        </div>
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .report-print, .report-print * { visibility: visible; }
          .report-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report body (light theme, print-friendly)
// ─────────────────────────────────────────────────────────────────────────────

function ReportBody({
  report,
  items,
  customLines,
  cashInHand,
}: {
  report: ReportType;
  items: IIngredient[];
  customLines: CustomLine[];
  cashInHand: number;
}) {
  const title = REPORTS.find((r) => r.id === report)?.label ?? 'Inventory Report';
  const now = new Date();

  const rows = useMemo(() => {
    if (report === 'low_stock') return items.filter((i) => stockStatus(i) !== 'ok');
    return items;
  }, [report, items]);

  const stockValue = useMemo(() => items.reduce((s, i) => s + itemValue(i), 0), [items]);
  const customTotal = customLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
        <div>
          <h1 className="text-xl font-bold">Inventory — {title} Report</h1>
          <p className="text-xs text-gray-600 mt-0.5">Generated {now.toLocaleString('en-IN')}</p>
        </div>
        <div className="text-right text-xs text-gray-700">
          <div>Items: {rows.length}</div>
          <div>Stock Value: ₨ {money(stockValue)}</div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-400 text-left text-xs uppercase text-gray-600">
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2">Unit</th>
            <th className="py-1.5 pr-2 text-right">Stock</th>
            {report === 'valuation' && <><th className="py-1.5 pr-2 text-right">Unit ₨</th><th className="py-1.5 pr-2 text-right">Value ₨</th></>}
            {report === 'low_stock' && <><th className="py-1.5 pr-2 text-right">Threshold</th><th className="py-1.5 pr-2">Status</th></>}
            {report === 'consumption' && <><th className="py-1.5 pr-2 text-right">Consumed</th><th className="py-1.5 pr-2 text-right">Restocked</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((i, idx) => (
            <tr key={i._id} className="border-b border-gray-200">
              <td className="py-1.5 pr-2 text-gray-500">{idx + 1}</td>
              <td className="py-1.5 pr-2 font-medium">
                {i.name}
                {i.category ? <span className="text-gray-500 text-xs"> · {i.category}</span> : ''}
              </td>
              <td className="py-1.5 pr-2 text-gray-600">{i.unit}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{i.stock}</td>
              {report === 'valuation' && (
                <>
                  <td className="py-1.5 pr-2 text-right font-mono">{unitValue(i) > 0 ? money2(unitValue(i)) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{money(itemValue(i))}</td>
                </>
              )}
              {report === 'low_stock' && (
                <>
                  <td className="py-1.5 pr-2 text-right font-mono">{i.lowStockThreshold}</td>
                  <td className="py-1.5 pr-2">{STATUS_META[stockStatus(i)].label}</td>
                </>
              )}
              {report === 'consumption' && (
                <>
                  <td className="py-1.5 pr-2 text-right font-mono">{(i.totalConsumed ?? 0).toFixed(1)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{(i.totalRestocked ?? 0).toFixed(1)}</td>
                </>
              )}
            </tr>
          ))}

          {/* Custom lines */}
          {customLines.filter((l) => l.label.trim()).map((l) => (
            <tr key={l.id} className="border-b border-gray-200 bg-gray-50">
              <td className="py-1.5 pr-2 text-gray-500">+</td>
              <td className="py-1.5 pr-2 font-medium italic">{l.label}</td>
              <td className="py-1.5 pr-2" />
              <td className="py-1.5 pr-2 text-right font-mono">{l.qty || ''}</td>
              {report === 'valuation' && <><td /><td className="py-1.5 pr-2 text-right font-mono">{l.amount ? money(parseFloat(l.amount)) : ''}</td></>}
              {report !== 'valuation' && <><td /><td className="py-1.5 pr-2 text-right font-mono">{l.amount ? money(parseFloat(l.amount)) : ''}</td></>}
            </tr>
          ))}
        </tbody>
        {report === 'valuation' && (
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={5} className="py-2 pr-2 text-right">Stock Value</td>
              <td className="py-2 pr-2 text-right font-mono">₨ {money(stockValue)}</td>
            </tr>
            {customTotal !== 0 && (
              <tr className="font-medium">
                <td colSpan={5} className="py-1 pr-2 text-right text-gray-600">Custom lines total</td>
                <td className="py-1 pr-2 text-right font-mono">₨ {money(customTotal)}</td>
              </tr>
            )}
            <tr className="font-bold">
              <td colSpan={5} className="py-1 pr-2 text-right">Cash In Hand</td>
              <td className="py-1 pr-2 text-right font-mono">₨ {money(cashInHand)}</td>
            </tr>
            <tr className="border-t border-black font-bold text-base">
              <td colSpan={5} className="py-2 pr-2 text-right">Total Capital</td>
              <td className="py-2 pr-2 text-right font-mono">₨ {money(stockValue + cashInHand + customTotal)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <div className="mt-6 pt-3 border-t border-gray-300 text-xs text-gray-500 flex justify-between">
        <span>XP POS — Inventory Report</span>
        <span>Signature: ____________________</span>
      </div>
    </div>
  );
}
