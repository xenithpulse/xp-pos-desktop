'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaDatabase, FaTrash, FaClock, FaSync } from 'react-icons/fa';
import type { CacheStats } from './types';

interface CacheControlsProps {
  stats: CacheStats;
  currentMonthCached: boolean;
  onClearAll: () => void;
  onClearCurrent: () => void;
  onRefresh: () => void;
  loading?: boolean;
}

export default function CacheControls({
  stats,
  currentMonthCached,
  onClearAll,
  onClearCurrent,
  onRefresh,
  loading,
}: CacheControlsProps) {
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-between gap-3 p-3 bg-linear-to-r from-slate-50 to-gray-50 rounded-xl border border-gray-100"
    >
      {/* Cache Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <FaDatabase className="text-green-500" />
          <span className="text-sm font-medium text-gray-700">Cache:</span>
        </div>
        
        <AnimatePresence mode="wait">
          {stats.totalCached > 0 ? (
            <motion.div
              key="cached"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-3"
            >
              <span className="px-2.5 py-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full">
                {stats.totalCached} month(s)
              </span>
              
              {stats.newestEntry && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <FaClock size={10} />
                  Last: {formatTime(stats.newestEntry)}
                </span>
              )}
              
              {stats.months.length > 0 && stats.months.length <= 4 && (
                <div className="hidden sm:flex items-center gap-1.5">
                  {stats.months.map((m) => (
                    <span
                      key={m}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.span
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-gray-400"
            >
              No cached data
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-100 transition-colors disabled:opacity-50"
        >
          <FaSync size={12} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </motion.button>

        {currentMonthCached && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClearCurrent}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-100 transition-colors"
          >
            <FaTrash size={10} />
            <span className="hidden sm:inline">Clear Month</span>
          </motion.button>
        )}

        {stats.totalCached > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors"
          >
            <FaTrash size={10} />
            <span className="hidden sm:inline">Clear All</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
