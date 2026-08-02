'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { DailySheet, Entry } from './types';

interface SearchResultsProps {
  query: string;
  results: DailySheet[];
  loading?: boolean;
  onSheetClick: (sheet: DailySheet) => void;
  total?: number;
}

export default function SearchResults({
  query,
  results,
  loading,
  onSheetClick,
  total,
}: SearchResultsProps) {
  if (!query.trim()) return null;

  const highlightMatch = (text: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.trim()})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-black/10 text-black px-0.5 rounded font-medium">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const getMatchingEntries = (sheet: DailySheet): Entry[] => {
    const q = query.trim().toLowerCase();
    return sheet.entries.filter(
      (e) =>
        (e.category && e.category.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between text-sm text-black/50 px-2">
        <span>Results for &ldquo;{query}&rdquo;</span>
        <span className="font-medium">{total ?? results.length} found</span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-3">
          <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          <span className="text-sm text-black/50">Searching...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-black/40">No results for &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[70vh] overflow-y-auto">
          {results.map((sheet, idx) => {
            const matchingEntries = getMatchingEntries(sheet);
            const closingBalance = sheet.closingBalance || 
              (sheet.openingBalance + sheet.totalIncome - sheet.totalExpense);

            return (
              <motion.div
                key={sheet._id}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.15 }}
                className="p-3 bg-white border border-black/10 rounded-lg hover:bg-black/5 cursor-pointer transition-colors"
                onClick={() => onSheetClick(sheet)}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-black">
                    {new Date(sheet.date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-600 font-medium">+{sheet.totalIncome.toLocaleString()}</span>
                    <span className="text-red-600 font-medium">-{sheet.totalExpense.toLocaleString()}</span>
                    <span className={`font-bold ${closingBalance >= 0 ? 'text-black' : 'text-red-700'}`}>
                      ={closingBalance.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Matching entries */}
                {matchingEntries.length > 0 && (
                  <div className="mt-2 border-t border-black/10 pt-2">
                    <table className="w-full text-xs">
                      <tbody>
                        {matchingEntries.slice(0, 3).map((e, i) => (
                          <tr key={i} className="border-b border-black/5 last:border-0">
                            <td className="py-1 text-black/60 capitalize w-1/4">
                              {highlightMatch(e.category?.replace(/_/g, ' ') || '-')}
                            </td>
                            <td className="py-1 text-black/80">
                              {highlightMatch(e.description || '-')}
                            </td>
                            <td className="py-1 text-right font-medium text-black tabular-nums">
                              {Number(e.amount || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {matchingEntries.length > 3 && (
                      <div className="text-xs text-black/40 text-center pt-1">
                        +{matchingEntries.length - 3} more matches
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
