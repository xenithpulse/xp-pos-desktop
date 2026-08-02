// Cache utility for month-based data with expiry
import type { DailySheet, MonthCacheEntry, CacheStats } from './types';

const CACHE_KEY_PREFIX = 'calendar_history_';
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes default

/**
 * Generate a unique cache key for a specific month/year
 */
export function getCacheKey(month: number, year: number): string {
  return `${CACHE_KEY_PREFIX}${year}_${month}`;
}

/**
 * Get cached data for a specific month
 */
export function getCachedMonth(month: number, year: number): DailySheet[] | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = getCacheKey(month, year);
    const cached = localStorage.getItem(key);
    
    if (!cached) return null;
    
    const entry: MonthCacheEntry = JSON.parse(cached);
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    
    return entry.sheets;
  } catch (error) {
    console.error('Error reading from cache:', error);
    return null;
  }
}

/**
 * Set cached data for a specific month
 */
export function setCachedMonth(
  month: number,
  year: number,
  sheets: DailySheet[],
  expiryMs: number = DEFAULT_EXPIRY_MS
): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = getCacheKey(month, year);
    const entry: MonthCacheEntry = {
      sheets,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + expiryMs,
    };
    
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error('Error writing to cache:', error);
  }
}

/**
 * Remove cached data for a specific month
 */
export function removeCachedMonth(month: number, year: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = getCacheKey(month, year);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from cache:', error);
  }
}

/**
 * Clear all calendar history cache
 */
export function clearAllCache(): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return keysToRemove.length;
  } catch (error) {
    console.error('Error clearing cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  if (typeof window === 'undefined') {
    return { totalCached: 0, months: [], oldestEntry: null, newestEntry: null };
  }
  
  try {
    const months: string[] = [];
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        const cached = localStorage.getItem(key);
        if (cached) {
          try {
            const entry: MonthCacheEntry = JSON.parse(cached);
            
            // Check if still valid
            if (Date.now() <= entry.expiresAt) {
              const [yearStr, monthStr] = key.replace(CACHE_KEY_PREFIX, '').split('_');
              const monthName = new Date(parseInt(yearStr), parseInt(monthStr)).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
              });
              months.push(monthName);
              
              if (oldestEntry === null || entry.fetchedAt < oldestEntry) {
                oldestEntry = entry.fetchedAt;
              }
              if (newestEntry === null || entry.fetchedAt > newestEntry) {
                newestEntry = entry.fetchedAt;
              }
            }
          } catch {
            // Invalid cache entry, skip
          }
        }
      }
    }
    
    return {
      totalCached: months.length,
      months,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { totalCached: 0, months: [], oldestEntry: null, newestEntry: null };
  }
}

/**
 * Check if a specific month is cached and valid
 */
export function isCached(month: number, year: number): boolean {
  return getCachedMonth(month, year) !== null;
}

/**
 * Get cache entry metadata (without full data)
 */
export function getCacheMetadata(month: number, year: number): { fetchedAt: number; expiresAt: number } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = getCacheKey(month, year);
    const cached = localStorage.getItem(key);
    
    if (!cached) return null;
    
    const entry: MonthCacheEntry = JSON.parse(cached);
    
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    
    return {
      fetchedAt: entry.fetchedAt,
      expiresAt: entry.expiresAt,
    };
  } catch {
    return null;
  }
}
