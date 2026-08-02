'use client';

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { DailySheet, IMonthlySheetDocument, CacheStats } from './types';
import {
  getCachedMonth,
  setCachedMonth,
  removeCachedMonth,
  clearAllCache,
  getCacheStats,
  isCached,
} from './cache';

interface UseCalendarHistoryOptions {
  initialMonth?: number;
  initialYear?: number;
  cacheExpiryMs?: number;
}

interface UseCalendarHistoryReturn {
  // State
  sheets: DailySheet[];
  loading: boolean;
  error: string | null;
  month: number;
  year: number;
  cacheStats: CacheStats;
  isCurrentMonthCached: boolean;
  
  // Actions
  fetchMonthData: (forceRefresh?: boolean) => Promise<void>;
  setMonth: (month: number, year: number) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  clearCurrentMonthCache: () => void;
  clearAllCacheData: () => void;
  refreshCacheStats: () => void;
  
  // Search
  searchSheets: (query: string) => Promise<DailySheet[]>;
  searchLoading: boolean;
  searchResults: DailySheet[];
  searchError: string | null;
}

export function useCalendarHistory(options: UseCalendarHistoryOptions = {}): UseCalendarHistoryReturn {
  const now = new Date();
  const {
    initialMonth = now.getMonth(),
    initialYear = now.getFullYear(),
    cacheExpiryMs = 15 * 60 * 1000, // 15 minutes
  } = options;

  const [month, setMonthState] = useState(initialMonth);
  const [year, setYearState] = useState(initialYear);
  const [sheets, setSheets] = useState<DailySheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats>({ totalCached: 0, months: [], oldestEntry: null, newestEntry: null });
  
  // Search state
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DailySheet[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const refreshCacheStats = useCallback(() => {
    setCacheStats(getCacheStats());
  }, []);

  const isCurrentMonthCached = isCached(month, year);

  /**
   * Calculate opening balances based on monthly sheet data
   * - Monthly Sheets have independent start/end dates (not tied to calendar month boundaries)
   * - If this is the first daily sheet of the monthly period (matches monthly start date), use the monthly opening balance
   * - For all other days, use the opening balance directly from the DailySheet collection
   */
  const processOpeningBalances = useCallback(
    (fetchedSheets: DailySheet[], monthly: IMonthlySheetDocument | null): DailySheet[] => {
      // Sort chronologically
      const sorted = [...fetchedSheets].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const monthlyStartDate = monthly?.startDate
        ? new Date(monthly.startDate).toISOString().split('T')[0]
        : null;

      return sorted.map((currentSheet) => {
        const currentSheetDate = new Date(currentSheet.date).toISOString().split('T')[0];
        let openingBalance: number;

        if (monthlyStartDate && currentSheetDate === monthlyStartDate) {
          // First day of the monthly period - use the monthly opening balance
          openingBalance = Number(monthly?.openingBalance ?? 0) || 0;
        } else {
          // Other days - use the opening balance directly from the DailySheet document
          openingBalance = Number(currentSheet.openingBalance ?? 0) || 0;
        }

        return {
          ...currentSheet,
          openingBalance,
        };
      });
    },
    []
  );

  /**
   * Fetch data for the current month
   */
  const fetchMonthData = useCallback(
    async (forceRefresh = false) => {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCachedMonth(month, year);
        if (cached) {
          setSheets(cached);
          refreshCacheStats();
          return;
        }
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch month-specific data from API
        const [historyRes, monthlyRes] = await Promise.all([
          axios.get(`/api/daily-sheet/history/month?month=${month}&year=${year}`),
          axios.get<IMonthlySheetDocument | null>('/api/monthly-sheets/active'),
        ]);

        const fetchedSheets: DailySheet[] = Array.isArray(historyRes.data.sheets)
          ? historyRes.data.sheets
          : [];
        const monthly = monthlyRes.data;

        const processed = processOpeningBalances(fetchedSheets, monthly);

        setSheets(processed);
        setCachedMonth(month, year, processed, cacheExpiryMs);
        refreshCacheStats();
      } catch (e) {
        console.error('Error fetching daily sheets:', e);
        setError(e instanceof Error ? e.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    },
    [month, year, cacheExpiryMs, processOpeningBalances, refreshCacheStats]
  );

  /**
   * Search sheets (independent API call)
   */
  const searchSheets = useCallback(async (query: string): Promise<DailySheet[]> => {
    if (!query.trim()) {
      setSearchResults([]);
      return [];
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      const res = await axios.get(`/api/daily-sheet/search`, {
        params: { q: query, limit: 50 },
      });

      const results: DailySheet[] = Array.isArray(res.data.sheets) ? res.data.sheets : [];
      setSearchResults(results);
      return results;
    } catch (e) {
      console.error('Search error:', e);
      const errorMsg = e instanceof Error ? e.message : 'Search failed';
      setSearchError(errorMsg);
      return [];
    } finally {
      setSearchLoading(false);
    }
  }, []);

  /**
   * Navigation helpers
   */
  const setMonth = useCallback((newMonth: number, newYear: number) => {
    setMonthState(newMonth);
    setYearState(newYear);
  }, []);

  const goToPrevMonth = useCallback(() => {
    const newDate = new Date(year, month - 1);
    setMonthState(newDate.getMonth());
    setYearState(newDate.getFullYear());
  }, [month, year]);

  const goToNextMonth = useCallback(() => {
    const newDate = new Date(year, month + 1);
    const now = new Date();
    // Don't go beyond current month
    if (newDate <= new Date(now.getFullYear(), now.getMonth() + 1, 0)) {
      setMonthState(newDate.getMonth());
      setYearState(newDate.getFullYear());
    }
  }, [month, year]);

  /**
   * Cache management
   */
  const clearCurrentMonthCache = useCallback(() => {
    removeCachedMonth(month, year);
    refreshCacheStats();
    // Re-fetch without cache
    fetchMonthData(true);
  }, [month, year, refreshCacheStats, fetchMonthData]);

  const clearAllCacheData = useCallback(() => {
    clearAllCache();
    refreshCacheStats();
    setSheets([]);
    // Re-fetch current month
    fetchMonthData(true);
  }, [refreshCacheStats, fetchMonthData]);

  // Fetch data when month/year changes
  useEffect(() => {
    fetchMonthData();
  }, [month, year]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize cache stats on mount
  useEffect(() => {
    refreshCacheStats();
  }, [refreshCacheStats]);

  return {
    sheets,
    loading,
    error,
    month,
    year,
    cacheStats,
    isCurrentMonthCached,
    fetchMonthData,
    setMonth,
    goToPrevMonth,
    goToNextMonth,
    clearCurrentMonthCache,
    clearAllCacheData,
    refreshCacheStats,
    searchSheets,
    searchLoading,
    searchResults,
    searchError,
  };
}
