'use client';

import React, { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaSearch,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaDatabase,
  FaTrash,
  FaSync,
  FaExclamationCircle,
  FaInfoCircle,
} from 'react-icons/fa';
import { useCalendarHistory } from './useCalendarHistory';
import CalendarGrid from './CalendarGrid';
import SearchResults from './SearchResults';
import DetailsModal from './DetailsModal';
import type { DailySheet } from './types';

// Debounce hook
function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

export default function CalendarHistory() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === 'super_admin';

  const {
    sheets,
    loading,
    error,
    month,
    year,
    cacheStats,
    isCurrentMonthCached,
    fetchMonthData,
    goToPrevMonth,
    goToNextMonth,
    clearCurrentMonthCache,
    clearAllCacheData,
    searchSheets,
    searchLoading,
    searchResults,
  } = useCalendarHistory();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSheet, setSelectedSheet] = useState<DailySheet | null>(null);
  const [showCacheInfo, setShowCacheInfo] = useState(false);

  // ── Delete Recent Sheet state ──
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetSheet, setDeleteTargetSheet] = useState<DailySheet | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deleteReport, setDeleteReport] = useState<Record<string, any> | null>(null);
  // Multi-phase: 'preview' → 'confirm' → 'progress' → 'summary'
  type DeletePhase = 'preview' | 'confirm' | 'progress' | 'summary';
  const [deletePhase, setDeletePhase] = useState<DeletePhase>('preview');
  // Step-by-step progress tracking
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  // Determine the most recent sheet across all loaded sheets
  const mostRecentSheetId = React.useMemo(() => {
    if (sheets.length === 0) return null;
    const sorted = [...sheets].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0]._id;
  }, [sheets]);

  const openDeleteModal = useCallback((sheet: DailySheet) => {
    setDeleteTargetSheet(sheet);
    setShowDeleteModal(true);
    setDeleteConfirmText('');
    setDeleteError(null);
    setDeleteReport(null);
    setDeletePhase('preview');
    setCompletedSteps([]);
    setActiveStep(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (!deleting && deletePhase !== 'progress') {
      setShowDeleteModal(false);
      setDeleteTargetSheet(null);
      setDeleteConfirmText('');
      setDeleteError(null);
      setDeleteReport(null);
      setDeletePhase('preview');
      setCompletedSteps([]);
      setActiveStep(null);
    }
  }, [deleting, deletePhase]);

  // Animate steps sequentially, then show summary
  const animateSteps = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (report: Record<string, any>) => {
      const steps = [0, 1, 2, 3]; // vouchers, slips, monthly, sheet
      let i = 0;
      const runNext = () => {
        if (i < steps.length) {
          const step = steps[i];
          setActiveStep(step);
          setTimeout(() => {
            setCompletedSteps((prev) => [...prev, step]);
            setActiveStep(null);
            i++;
            setTimeout(runNext, 250);
          }, 600);
        } else {
          // All steps done → summary
          setTimeout(() => {
            setDeleteReport(report);
            setDeletePhase('summary');
          }, 300);
        }
      };
      runNext();
    },
    []
  );

  const handleDeleteSheet = useCallback(async () => {
    if (!deleteTargetSheet || deleteConfirmText !== 'delete daily sheet') return;

    setDeleting(true);
    setDeleteError(null);
    setDeletePhase('progress');
    setCompletedSteps([]);
    setActiveStep(null);

    try {
      const res = await axios.delete('/api/daily-sheet/delete', {
        data: { sheetId: deleteTargetSheet._id, confirmText: deleteConfirmText },
      });

      // Animate through steps
      animateSteps(res.data.undoReport);

      // Close the details modal if it was showing this sheet
      if (selectedSheet?._id === deleteTargetSheet._id) {
        setSelectedSheet(null);
      }

      // Clear cache and refresh
      clearCurrentMonthCache();
      await fetchMonthData(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to delete daily sheet.';
      setDeleteError(msg);
      setDeletePhase('confirm'); // Go back to confirm so user can see the error
    } finally {
      setDeleting(false);
    }
  }, [deleteTargetSheet, deleteConfirmText, selectedSheet, clearCurrentMonthCache, fetchMonthData, animateSteps]);

  const debouncedSearch = useDebounce((query: string) => {
    searchSheets(query);
  }, 400);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };

  const clearSearch = () => {
    setSearchQuery('');
    searchSheets('');
  };

  const handleSheetClick = (sheet: DailySheet) => {
    setSelectedSheet(sheet);
  };

  const closeModal = () => {
    setSelectedSheet(null);
  };

  // Monthly stats
  const stats = React.useMemo(() => {
    const inc = sheets.reduce((s, x) => s + (x.totalIncome || 0), 0);
    const exp = sheets.reduce((s, x) => s + (x.totalExpense || 0), 0);
    return { inc, exp, net: inc - exp, days: sheets.length };
  }, [sheets]);

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="bg-white rounded-lg border border-black/10 overflow-hidden shadow-sm">
      {/* Smart Toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-black/5 bg-gray-50/50 flex-wrap">
        
        {/* Left Section: Month Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="p-2 rounded-md hover:bg-black/5 transition-colors"
          >
            <FaChevronLeft size={14} className="text-black" />
          </button>
          <div className="flex items-center gap-2 min-w-35 justify-center">
            <span className="text-sm font-semibold text-black">{monthLabel}</span>
            {loading && (
              <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            )}
          </div>
          <button
            onClick={goToNextMonth}
            className="p-2 rounded-md hover:bg-black/5 transition-colors"
          >
            <FaChevronRight size={14} className="text-black" />
          </button>
        </div>

        {/* Center Section: Search */}
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-8 py-2 text-sm border border-black/10 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black/20 transition-all"
          />
          <FaSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded transition-colors"
            >
              <FaTimes size={12} className="text-black/40" />
            </button>
          )}
        </div>

        {/* Right Section: Stats + Cache */}
        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-3 text-sm">
            <span className="text-black/50 italic">{stats.days} days</span>
            <span className="text-green-600 font-medium">+{stats.inc.toLocaleString()}</span>
            <span className="text-red-600 font-medium">-{stats.exp.toLocaleString()}</span>
            <span className={`font-bold px-2 py-0.5 rounded ${stats.net >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
              {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
            </span>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-black/10" />

          {/* Cache Controls with Info */}
          <div className="flex items-center gap-2 relative">
            {/* Info Icon with Tooltip */}
            <div 
              className="relative"
              onMouseEnter={() => setShowCacheInfo(true)}
              onMouseLeave={() => setShowCacheInfo(false)}
            >
              <button className="relative p-1.5 rounded-full transition-colors text-green-500 hover:bg-green-50 hover:text-green-600">
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-40" />
                <FaInfoCircle size={14} className="relative z-10" />
              </button>
              
              <AnimatePresence>
                {showCacheInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-50 right-0 top-full mt-2 w-72 p-4 rounded-lg shadow-xl border border-black/10 bg-white"
                  >
                    <h4 className="font-semibold text-black text-sm mb-2 flex items-center gap-2">
                      <FaDatabase className="text-green-600" />
                      How Caching Works
                    </h4>
                    <ul className="text-xs text-black/70 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">•</span>
                        <span>Data is cached per month for <strong>15 minutes</strong> to reduce API calls</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">•</span>
                        <span>Cached months show a <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]"><FaDatabase size={8}/>cached</span> badge</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-black/40 mt-0.5">•</span>
                        <span>Click <FaSync size={10} className="inline text-black/60" /> to force refresh current month</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span>
                        <span>Click <FaTrash size={10} className="inline text-red-500" /> to clear cache manually</span>
                      </li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-black/5 text-[10px] text-black/40">
                      Cache stored in browser localStorage
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Cache Status Badge */}
            {isCurrentMonthCached && (
              <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-green-700 bg-green-50 rounded-md border border-green-100">
                <FaDatabase size={10} />
                <span>cached</span>
              </span>
            )}

            {/* Cached Months Count */}
            {cacheStats.totalCached > 0 && (
              <span className="text-xs text-black/40 hidden sm:inline">
                {cacheStats.totalCached} month{cacheStats.totalCached > 1 ? 's' : ''}
              </span>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => fetchMonthData(true)}
              disabled={loading}
              className="p-2 rounded-md hover:bg-black/5 transition-colors disabled:opacity-40"
              title="Force refresh data"
            >
              <FaSync size={14} className={`text-black/60 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Clear Current Month */}
            {isCurrentMonthCached && (
              <button
                onClick={clearCurrentMonthCache}
                className="p-2 rounded-md hover:bg-red-50 transition-colors group"
                title="Clear this month's cache"
              >
                <FaTrash size={12} className="text-red-400 group-hover:text-red-600" />
              </button>
            )}

            {/* Clear All Cache */}
            {cacheStats.totalCached > 1 && (
              <button
                onClick={clearAllCacheData}
                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="Clear all cached data"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Stats Row */}
      <div className="sm:hidden flex items-center justify-center gap-4 px-4 py-2 bg-gray-50/30 border-b border-black/5 text-xs">
        <span className="text-black/50">{stats.days} days</span>
        <span className="text-green-600 font-medium">+{stats.inc.toLocaleString()}</span>
        <span className="text-red-600 font-medium">-{stats.exp.toLocaleString()}</span>
        <span className={`font-bold ${stats.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          ={stats.net.toLocaleString()}
        </span>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-red-100">
              <FaExclamationCircle size={14} />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area - Calendar or Search Results */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              <SearchResults
                query={searchQuery}
                results={searchResults}
                loading={searchLoading}
                onSheetClick={handleSheetClick}
              />
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {loading && sheets.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3">
                  <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  <span className="text-sm text-black/50">Loading sheets...</span>
                </div>
              ) : sheets.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-black/40">No sheets found for {monthLabel}</p>
                </div>
              ) : (
                <CalendarGrid
                  month={month}
                  year={year}
                  sheets={sheets}
                  onSheetClick={handleSheetClick}
                  loading={loading}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedSheet && (
          <DetailsModal
            sheet={selectedSheet}
            openingBalance={selectedSheet.openingBalance}
            onClose={closeModal}
            isLatest={isSuperAdmin && selectedSheet._id === mostRecentSheetId}
            onDelete={isSuperAdmin ? () => {
              closeModal();
              openDeleteModal(selectedSheet);
            } : undefined}
          />
        )}
      </AnimatePresence>

      {/* Delete Multi-Phase Modal */}
      <AnimatePresence>
        {showDeleteModal && deleteTargetSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleting) closeDeleteModal();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 border border-red-200 overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header — always visible */}
              <div className="px-5 py-4 border-b border-red-100 bg-red-50 shrink-0">
                <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <FaExclamationCircle size={14} />
                  {deletePhase === 'summary' ? 'Deletion Complete' : 'Delete Recent Daily Sheet'}
                </h3>
                <p className="text-xs text-red-600/70 mt-1">
                  {new Date(deleteTargetSheet.date).toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ═══ PHASE: PREVIEW ═══ */}
                  {deletePhase === 'preview' && (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 py-4 space-y-4"
                    >
                      {/* Financial summary */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2 bg-gray-50 rounded-lg">
                          <div className="text-[10px] text-black/40 uppercase tracking-wide">Open</div>
                          <div className="text-xs font-semibold text-black mt-0.5">{deleteTargetSheet.openingBalance?.toLocaleString()}</div>
                        </div>
                        <div className="p-2 bg-green-50 rounded-lg">
                          <div className="text-[10px] text-green-600 uppercase tracking-wide">Income</div>
                          <div className="text-xs font-semibold text-green-600 mt-0.5">+{deleteTargetSheet.totalIncome?.toLocaleString()}</div>
                        </div>
                        <div className="p-2 bg-red-50 rounded-lg">
                          <div className="text-[10px] text-red-600 uppercase tracking-wide">Expense</div>
                          <div className="text-xs font-semibold text-red-600 mt-0.5">-{deleteTargetSheet.totalExpense?.toLocaleString()}</div>
                        </div>
                        <div className="p-2 bg-black/5 rounded-lg">
                          <div className="text-[10px] text-black/50 uppercase tracking-wide">Close</div>
                          <div className="text-xs font-bold text-black mt-0.5">{deleteTargetSheet.closingBalance?.toLocaleString()}</div>
                        </div>
                      </div>

                      {/* Slip entries */}
                      {deleteTargetSheet.slipEntries.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1 h-3.5 bg-green-500 rounded-full" />
                            <span className="text-xs font-semibold text-black/60">
                              Slip Entries ({deleteTargetSheet.slipEntries.length}) — will be reset to unused
                            </span>
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {deleteTargetSheet.slipEntries.map((s, i) => (
                              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-green-50/60 rounded text-xs border border-green-100">
                                <span className="text-black/70">{s.copyNumber}/{s.uniqueNumber}</span>
                                <span className="font-medium text-green-700">{s.amount?.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Expense entries */}
                      {deleteTargetSheet.entries.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1 h-3.5 bg-black rounded-full" />
                            <span className="text-xs font-semibold text-black/60">
                              Expense Entries ({deleteTargetSheet.entries.length}) — vouchers will be deleted
                            </span>
                          </div>
                          <div className="space-y-1 max-h-28 overflow-y-auto">
                            {deleteTargetSheet.entries.map((e, i) => (
                              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 rounded text-xs border border-black/5">
                                <div className="flex items-center gap-2">
                                  <span className="capitalize text-black/70">{e.category?.replace(/_/g, ' ')}</span>
                                  {e.postedCopyNumber && e.postedCopyNumber !== '—' && (
                                    <span className="text-black/30 text-[10px]">V: {e.postedCopyNumber}/{e.postedUniqueNumber}</span>
                                  )}
                                </div>
                                <span className="font-medium text-red-600">{e.amount?.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Impact warning */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <p className="text-xs text-amber-800 font-medium mb-1">What will happen:</p>
                        <ul className="text-[11px] text-amber-700 space-y-0.5 pl-3 list-disc">
                          <li>{deleteTargetSheet.entries.length} voucher(s) will be permanently deleted</li>
                          <li>{deleteTargetSheet.slipEntries.length} cash slip(s) will be reset to unused</li>
                          <li>Monthly sheet summary will be recalculated</li>
                          <li>Balance chain will revert to previous day&apos;s closing</li>
                        </ul>
                      </div>
                    </motion.div>
                  )}

                  {/* ═══ PHASE: CONFIRM ═══ */}
                  {deletePhase === 'confirm' && (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 py-4 space-y-4"
                    >
                      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <FaExclamationCircle size={14} className="text-red-600" />
                        </div>
                        <p className="text-xs text-red-800 leading-relaxed">
                          This action is <strong>irreversible</strong>. All {deleteTargetSheet.entries.length} expense voucher(s) and {deleteTargetSheet.slipEntries.length} slip record(s) will be undone.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                          Type <span className="font-mono text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[11px]">delete daily sheet</span> to confirm:
                        </label>
                        <input
                          type="text"
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          placeholder="delete daily sheet"
                          disabled={deleting}
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 disabled:opacity-50 font-mono"
                          autoComplete="off"
                          autoFocus
                        />
                      </div>

                      {deleteError && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {deleteError}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ═══ PHASE: PROGRESS ═══ */}
                  {deletePhase === 'progress' && (
                    <motion.div
                      key="progress"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 py-6 space-y-3"
                    >
                      {[
                        { label: 'Deleting vouchers', detail: `${deleteTargetSheet.entries.length} expense voucher(s)` },
                        { label: 'Resetting cash slips', detail: `${deleteTargetSheet.slipEntries.length} slip(s) → unused` },
                        { label: 'Updating monthly sheet', detail: 'Removing daily summary & recalculating' },
                        { label: 'Removing daily sheet', detail: 'Deleting the sheet record' },
                      ].map((step, i) => {
                        const isDone = completedSteps.includes(i);
                        const isActive = activeStep === i;
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0.4, y: 5 }}
                            animate={{
                              opacity: isDone || isActive ? 1 : 0.4,
                              y: 0,
                            }}
                            transition={{ duration: 0.3, delay: i * 0.08 }}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors duration-300 ${
                              isDone
                                ? 'bg-green-50 border-green-200'
                                : isActive
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-gray-50 border-gray-100'
                            }`}
                          >
                            {/* Step indicator */}
                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                              {isDone ? (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                >
                                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </motion.div>
                              ) : isActive ? (
                                <div className="w-4 h-4 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin" />
                              ) : (
                                <div className="w-3 h-3 rounded-full bg-gray-200" />
                              )}
                            </div>
                            {/* Labels */}
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium ${isDone ? 'text-green-800' : isActive ? 'text-amber-800' : 'text-gray-400'}`}>
                                {step.label}
                              </div>
                              <div className={`text-[10px] ${isDone ? 'text-green-600' : isActive ? 'text-amber-600' : 'text-gray-300'}`}>
                                {step.detail}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* ═══ PHASE: SUMMARY ═══ */}
                  {deletePhase === 'summary' && deleteReport && (
                    <motion.div
                      key="summary"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="px-5 py-4 space-y-4"
                    >
                      {/* Success banner */}
                      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-3">
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
                        >
                          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </motion.div>
                        <div>
                          <p className="text-xs font-semibold text-green-800">Daily sheet deleted successfully</p>
                          <p className="text-[10px] text-green-600 mt-0.5">All side-effects have been reversed</p>
                        </div>
                      </div>

                      {/* Vouchers summary */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-black/60 flex items-center gap-2">
                          <div className="w-1 h-3.5 bg-red-500 rounded-full" />
                          Vouchers Deleted ({(deleteReport.vouchersDeleted as { _id: string }[])?.length ?? 0})
                        </div>
                        {(deleteReport.vouchersDeleted as { copyNumber: string; uniqueNumber: string; amount: number; description: string }[])?.length > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {(deleteReport.vouchersDeleted as { copyNumber: string; uniqueNumber: string; amount: number; description: string }[]).map((v, i) => (
                              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-red-50/60 rounded text-xs border border-red-100">
                                <span className="text-black/60">{v.copyNumber}/{v.uniqueNumber}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-black/40 text-[10px] truncate max-w-[120px]">{v.description}</span>
                                  <span className="font-medium text-red-600">{v.amount?.toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-black/30 pl-3">No vouchers were associated</p>
                        )}
                      </div>

                      {/* Slips summary */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-black/60 flex items-center gap-2">
                          <div className="w-1 h-3.5 bg-green-500 rounded-full" />
                          Cash Slips Reset ({(deleteReport.cashSlipsReset as { copyNumber: string }[])?.length ?? 0})
                        </div>
                        {(deleteReport.cashSlipsReset as { copyNumber: string; uniqueNumber: string; amount: number }[])?.length > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {(deleteReport.cashSlipsReset as { copyNumber: string; uniqueNumber: string; amount: number }[]).map((s, i) => (
                              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-green-50/60 rounded text-xs border border-green-100">
                                <span className="text-black/60">{s.copyNumber}/{s.uniqueNumber}</span>
                                <span className="font-medium text-green-700">{s.amount?.toLocaleString()} → unused</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-black/30 pl-3">No slips were associated</p>
                        )}
                      </div>

                      {/* Monthly sheet impact */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-black/60 flex items-center gap-2">
                          <div className="w-1 h-3.5 bg-blue-500 rounded-full" />
                          Monthly Sheet Updated {deleteReport.monthlyLabel ? `(${deleteReport.monthlyLabel as string})` : ''}
                        </div>
                        {deleteReport.monthlySummaryRemoved ? (
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-2 bg-gray-50 rounded-lg">
                              <div className="text-[9px] text-black/40 uppercase">Income</div>
                              <div className="text-[10px] text-black/30 line-through">{(deleteReport.monthlyOldIncome as number)?.toLocaleString()}</div>
                              <div className="text-xs font-semibold text-green-700">{(deleteReport.monthlyNewIncome as number)?.toLocaleString()}</div>
                            </div>
                            <div className="p-2 bg-gray-50 rounded-lg">
                              <div className="text-[9px] text-black/40 uppercase">Expense</div>
                              <div className="text-[10px] text-black/30 line-through">{(deleteReport.monthlyOldExpense as number)?.toLocaleString()}</div>
                              <div className="text-xs font-semibold text-red-600">{(deleteReport.monthlyNewExpense as number)?.toLocaleString()}</div>
                            </div>
                            <div className="p-2 bg-black/5 rounded-lg">
                              <div className="text-[9px] text-black/40 uppercase">Closing</div>
                              <div className="text-[10px] text-black/30 line-through">{(deleteReport.monthlyOldClosing as number)?.toLocaleString()}</div>
                              <div className="text-xs font-bold text-black">{(deleteReport.monthlyNewClosing as number)?.toLocaleString()}</div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-black/30 pl-3">Summary removal was skipped</p>
                        )}
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Footer — phase-dependent */}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                {deletePhase === 'preview' && (
                  <>
                    <button
                      onClick={closeDeleteModal}
                      className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setDeletePhase('confirm')}
                      className="px-4 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Proceed to Delete
                    </button>
                  </>
                )}
                {deletePhase === 'confirm' && (
                  <>
                    <button
                      onClick={() => { setDeletePhase('preview'); setDeleteError(null); }}
                      disabled={deleting}
                      className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleDeleteSheet}
                      disabled={deleting || deleteConfirmText !== 'delete daily sheet'}
                      className="px-4 py-2 text-xs font-medium text-white bg-red-600 border border-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                    >
                      {deleting && (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {deleting ? 'Deleting...' : 'Delete Permanently'}
                    </button>
                  </>
                )}
                {deletePhase === 'progress' && (
                  <div className="flex-1 text-center">
                    <span className="text-xs text-black/40 italic">Processing cascade operations...</span>
                  </div>
                )}
                {deletePhase === 'summary' && (
                  <>
                    <span className="text-[10px] text-black/30">A detailed notification has been sent</span>
                    <button
                      onClick={closeDeleteModal}
                      className="px-5 py-2 text-xs font-medium text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
