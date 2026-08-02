"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MarkCashSlipsUsedModal from './ManageUnusedClip';
import { Info, Loader2, ChevronLeft, ChevronRight, Link2, Search } from 'lucide-react';
import { useDailySheet } from '../DailySheetContext';

// Booking link summary (mirrors CashSlip.addedToContract entries)
interface BookingLinkLite {
  bookingId?: string;
  clientName?: string;
  bookingUniqueId?: string;
  eventTimeAndDate?: string;
  hallArea?: string;
  guest?: number;
}

// Lightweight slip type for optimized payload
interface LightweightSlip {
  _id: string;
  uniqueNumber: string;
  copyNumber: string;
  amount: number;
  paymentMethod: string;
  description: string;
  createdAt: string | null;
  signedByCEO: boolean;
  addedToContract?: BookingLinkLite[];
}

interface PaginatedResponse {
  data: LightweightSlip[];
  total: number;
  page: number;
  limit: number;
  lastPage: number;
  paymentMethods: string[];
}

// Tooltip component for description hover
const DescriptionTooltip = ({ description, children }: { description: string; children: React.ReactNode }) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!description) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPosition({ x: rect.left, y: rect.bottom + 4 });
    setShow(true);
  };

  return (
    <div 
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
      className="relative inline-flex items-center"
    >
      {children}
      {show && description && (
        <div 
          className="fixed z-50 max-w-xs px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg animate-in fade-in duration-150"
          style={{ left: position.x, top: position.y }}
        >
          <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 rotate-45" />
          {description}
        </div>
      )}
    </div>
  );
};

// Skeleton row for loading state - prevents layout shift
const SkeletonRow = () => (
  <tr className="animate-pulse">
    <td className="px-3 py-2"><div className="h-4 bg-gray-200 rounded w-16" /></td>
    <td className="px-3 py-2"><div className="h-4 bg-gray-200 rounded w-12" /></td>
    <td className="px-3 py-2"><div className="h-4 bg-gray-200 rounded w-20" /></td>
    <td className="px-3 py-2"><div className="h-4 bg-gray-200 rounded w-24" /></td>
  </tr>
);

// UnusedSlipsSection Component with server-side pagination
export const UnusedSlipsSection = () => {
  // Subscribe to context's slipVersion — called unconditionally (Rules of Hooks)
  const { slipVersion, refreshSheet, notifySlipMutation } = useDailySheet();

  const [slips, setSlips] = useState<LightweightSlip[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Single unified search term — replaces all previous filters/searches.
  // The API matches it against slipNo, copyNo, paymentMethod, description,
  // booking fields, ObjectId, and exact amount.
  const [search, setSearch] = useState('');

  // Debounce ref for filter inputs
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch slips with server-side pagination and unified search
  const fetchSlips = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (search.trim()) params.set('q', search.trim());

    try {
      const res = await fetch(`/api/cash-slips/unused-slips?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch slips');

      const result: PaginatedResponse = await res.json();
      setSlips(result.data);
      setTotalPages(result.lastPage);
      setTotal(result.total);
      setCurrentPage(result.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [search, limit]);

  // Initial fetch and refetch when slips are added/reverted
  useEffect(() => {
    fetchSlips(1);
  }, [slipVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced fetch on search change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSlips(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchSlips(newPage);
    }
  };

  return (
    <div className="w-full lg:w-1/3 p-4 border border-gray-200 rounded-lg space-y-4">
      {/* Header with info icon + green ping pulse */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold text-gray-800">Unused Slips</h3>
          <div className="relative group cursor-help">
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <Info className="w-4 h-4 text-gray-400" />
            {/* Usage tooltip on hover */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
              <p className="font-medium mb-1">Unused Cash Slips</p>
              <p className="text-gray-300">Track and Withdraw cash slips that have been created but not yet used as income to make daily expenses. Use filters to find specific slips and click &quot;Withdraw / Mark Used&quot; to mark slips as used if they are not necessary.</p>
            </div>
          </div>
          {total > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {total}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1 bg-black text-white rounded text-sm hover:bg-gray-800 transition-colors"
        >
          Withdraw / Mark Used
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center p-4 bg-red-50 rounded-lg">
          <p className="text-red-600 font-medium text-sm">An error occurred</p>
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Filters */}
      {!error && (
        <>
          {/* Single unified search — slip no., copy, payment method, description,
              booking ID/uniqueId/client/hall, ObjectId, or exact amount. */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search slips — slip no., copy, payment, description, booking, client, amount…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 text-sm transition-shadow"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Table with fixed height to prevent layout shift */}
          <div className="h-[360px] border rounded overflow-hidden">
            <div className="h-full overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slip No.</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Copy</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    // Skeleton loading - matches actual row count to prevent layout shift
                    Array.from({ length: limit }).map((_, i) => <SkeletonRow key={i} />)
                  ) : slips.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-gray-500 text-sm">
                        No unused slips found
                      </td>
                    </tr>
                  ) : (
                    slips.map((slip) => {
                      const bookings = slip.addedToContract ?? [];
                      const bookingTooltip = bookings
                        .map((b) =>
                          [b.clientName, b.bookingUniqueId, b.eventTimeAndDate, b.hallArea]
                            .filter(Boolean)
                            .join(' • ')
                        )
                        .join('\n');
                      return (
                      <tr key={slip._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          <DescriptionTooltip description={slip.description}>
                            <span className="cursor-default">{slip.uniqueNumber}</span>
                            {slip.description && (
                              <Info className="w-3 h-3 ml-1 text-gray-400 inline-block" />
                            )}
                          </DescriptionTooltip>
                          {bookings.length > 0 && (
                            <span
                              className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-semibold align-middle"
                              title={bookingTooltip || 'Linked to contract'}
                            >
                              <Link2 className="w-2.5 h-2.5" />
                              {bookings.length}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{slip.copyNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {slip.amount.toLocaleString()}
                          <span className="text-[9px] text-gray-500 ml-1">({slip.paymentMethod})</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {slip.createdAt ? new Date(slip.createdAt).toLocaleDateString() : '-'}
                          {slip.signedByCEO && (
                            <span className="ml-1 text-emerald-500 inline-flex">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-sm text-gray-600 flex items-center gap-2">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      <MarkCashSlipsUsedModal isOpen={open} onClose={() => setOpen(false)} onMutate={() => { notifySlipMutation(); void refreshSheet(); }} />
    </div>
  );
};
