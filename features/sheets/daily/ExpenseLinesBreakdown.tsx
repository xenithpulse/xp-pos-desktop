// ExpenseLinesBreakdown.tsx
// Shared visual for multi-line expense / voucher detail.
// Used by:
//   - features/DailySheet/DailyExpenseList.tsx  (expanded row under each expense)
//   - features/Vouchers/Vouchers.tsx            (expanded row under each voucher)
"use client";

import React from "react";

export interface IBreakdownLine {
  groupName?: string;
  subCategory?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  description?: string;
}

interface Props {
  lines: IBreakdownLine[];
  /** Voucher / expense total, used to render the reconciliation footer. */
  total?: number;
  /** Optional vendor pinned on the parent record. */
  vendorName?: string | null;
  /** Compact look (smaller padding/text). */
  dense?: boolean;
}

/* ── helpers ─────────────────────────────────────────────────────── */
const FMT = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });
const fmt = (n: number | undefined | null) =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : FMT.format(n);

// Stable group → tailwind palette (ring + bg + text), so the same group
// always paints the same color across rows.
const PALETTES = [
  { bg: "bg-rose-50",    text: "text-rose-700",    ring: "ring-rose-200",    dot: "bg-rose-500" },
  { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   dot: "bg-amber-500" },
  { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-sky-50",     text: "text-sky-700",     ring: "ring-sky-200",     dot: "bg-sky-500" },
  { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-200",  dot: "bg-violet-500" },
  { bg: "bg-fuchsia-50", text: "text-fuchsia-700", ring: "ring-fuchsia-200", dot: "bg-fuchsia-500" },
  { bg: "bg-teal-50",    text: "text-teal-700",    ring: "ring-teal-200",    dot: "bg-teal-500" },
  { bg: "bg-lime-50",    text: "text-lime-700",    ring: "ring-lime-200",    dot: "bg-lime-500" },
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function paletteFor(group: string | undefined): typeof PALETTES[number] {
  return PALETTES[hashStr(group ?? "—") % PALETTES.length];
}

/* ── component ───────────────────────────────────────────────────── */
export default function ExpenseLinesBreakdown({
  lines,
  total,
  vendorName,
  dense = false,
}: Props) {
  if (!lines?.length) return null;

  const sumLines = lines.reduce((s, ln) => s + (Number(ln.amount) || 0), 0);
  // Group → its [count, sum] for the per-group mini-roll-up.
  const groupRoll = new Map<string, { count: number; sum: number }>();
  for (const ln of lines) {
    const k = ln.groupName ?? "Uncategorised";
    const r = groupRoll.get(k) ?? { count: 0, sum: 0 };
    r.count += 1;
    r.sum += Number(ln.amount) || 0;
    groupRoll.set(k, r);
  }

  const hasTotal = typeof total === "number" && Number.isFinite(total);
  const delta = hasTotal ? Number((sumLines - (total as number)).toFixed(2)) : 0;
  const deltaOk = Math.abs(delta) < 0.01;

  // Skipped lines = those that won't post to RawExpenseLedger because they
  // lack groupName or subCategory. Surface this so the operator can fix it
  // before clicking "Post → Ledgers".
  const skipped = lines.filter((ln) => !ln.groupName || !ln.subCategory).length;

  const pad = dense ? "p-2" : "p-3";
  const headTxt = dense ? "text-[10px]" : "text-[11px]";

  return (
    <div className={`rounded-lg border border-gray-200 bg-gradient-to-b from-gray-50 to-white ${pad}`}>
      {/* ── group roll-up chips + vendor + skipped warning ───────── */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className={`${headTxt} uppercase tracking-wider text-gray-500 mr-1`}>Groups:</span>
        {Array.from(groupRoll.entries()).map(([g, r]) => {
          const p = paletteFor(g);
          return (
            <span
              key={g}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${p.bg} ${p.text} ${p.ring}`}
              title={`${r.count} line${r.count === 1 ? "" : "s"} totalling ${fmt(r.sum)}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
              {g}
              <span className="text-gray-400 font-normal">·</span>
              <span className="tabular-nums">{fmt(r.sum)}</span>
            </span>
          );
        })}
        {vendorName && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 bg-amber-50 text-amber-800 ring-amber-200">
            🏢 <span className="font-semibold">{vendorName}</span>
          </span>
        )}
        {skipped > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 bg-yellow-50 text-yellow-800 ring-yellow-300"
            title="These lines lack group / sub-category and will be skipped when posting to the raw expense ledger."
          >
            ⚠ {skipped} line{skipped === 1 ? "" : "s"} won&apos;t post
          </span>
        )}
      </div>

      {/* ── line table ─────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full table-auto text-xs">
          <thead className="bg-gray-100 text-gray-600">
            <tr className={`${headTxt} uppercase tracking-wider`}>
              <th className="px-2 py-1.5 text-left w-8">#</th>
              <th className="px-2 py-1.5 text-left">Group</th>
              <th className="px-2 py-1.5 text-left">Description</th>
              <th className="px-2 py-1.5 text-left">Sub-Category</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-left">Unit</th>
              <th className="px-2 py-1.5 text-right">Rate</th>
              <th className="px-2 py-1.5 text-right">Calc</th>
              <th className="px-2 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((ln, i) => {
              const p = paletteFor(ln.groupName);
              const calc = (ln.quantity ?? 0) * (ln.rate ?? 0);
              const haveCalc = ln.quantity !== undefined && ln.rate !== undefined;
              const calcMatches = haveCalc && Math.abs(calc - (Number(ln.amount) || 0)) < 0.01;
              const incomplete = !ln.groupName || !ln.subCategory;
              return (
                <tr
                  key={i}
                  className={`border-t border-gray-200 ${incomplete ? "bg-yellow-50/50" : "hover:bg-gray-50"}`}
                  title={incomplete ? "Missing group or sub-category — will be skipped on Post → Ledgers" : undefined}
                >
                  <td className="px-2 py-1.5 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${p.bg} ${p.text} ${p.ring}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                      {ln.groupName ?? "—"}
                    </span>
                  </td>
                  <td
                    className="px-2 py-1.5 text-gray-600 italic max-w-[220px] truncate"
                    title={ln.description ?? ""}
                  >
                    {ln.description ? ln.description : <span className="text-gray-300 not-italic">—</span>}
                  </td>
                  <td className="px-2 py-1.5 font-medium text-gray-900">
                    {ln.subCategory ?? <span className="italic text-gray-400">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(ln.quantity)}</td>
                  <td className="px-2 py-1.5 text-gray-600">{ln.unit ?? ""}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(ln.rate)}</td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      !haveCalc ? "text-gray-400" : calcMatches ? "text-emerald-600" : "text-rose-600"
                    }`}
                    title={
                      !haveCalc
                        ? ""
                        : calcMatches
                        ? "qty × rate matches stored amount"
                        : `qty × rate = ${fmt(calc)} — does not match stored amount ${fmt(ln.amount)}`
                    }
                  >
                    {haveCalc ? fmt(calc) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-gray-900">
                    {fmt(ln.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 text-gray-700">
            <tr className="border-t-2 border-gray-300">
              <td colSpan={8} className="px-2 py-1.5 text-right font-medium uppercase tracking-wider text-[10px] text-gray-500">
                Σ {lines.length} line{lines.length === 1 ? "" : "s"}
              </td>
              <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">{fmt(sumLines)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── footer reconciliation ──────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-gray-300 pt-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-gray-600">
          <span>
            <span className="text-gray-400">Lines:</span>{" "}
            <span className="font-semibold text-gray-800 tabular-nums">{lines.length}</span>
          </span>
          <span>
            <span className="text-gray-400">Σ amount:</span>{" "}
            <span className="font-mono font-semibold text-gray-800 tabular-nums">₨ {fmt(sumLines)}</span>
          </span>
          {hasTotal && (
            <span>
              <span className="text-gray-400">Total:</span>{" "}
              <span className="font-mono font-semibold text-gray-800 tabular-nums">₨ {fmt(total)}</span>
            </span>
          )}
        </div>
        {hasTotal && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
              deltaOk
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
            title={deltaOk ? "Lines reconcile with the parent total" : `Off by ${fmt(Math.abs(delta))}`}
          >
            {deltaOk ? "✓ reconciles" : `⚠ off by ₨ ${fmt(Math.abs(delta))}`}
          </span>
        )}
      </div>
    </div>
  );
}
