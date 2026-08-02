'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Activity log entry ── */
export interface ActivityLogEntry {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  ts: number;
}

interface LiveIndicatorProps {
  title?: string;
  postedCount: number;
  totalCount: number;
  syncStatus?: 'Polling' | 'Idle' | 'Error' | string;
  onRefresh?: () => void;
  loading?: boolean;
  /** Current activity log entry (latest) — driven by parent */
  activity?: ActivityLogEntry | null;
}

export const LiveIndicator: React.FC<LiveIndicatorProps> = ({
  title = 'Expense List',
  postedCount,
  totalCount,
  syncStatus = 'Polling',
  onRefresh,
  loading = true,
  activity = null,
}) => {

  return (
    <div className="flex flex-col gap-0 px-1 w-full">
      {/* Top row: title + stats */}
      <div className="flex justify-between items-center">
        <h2 className="text-md font-bold italic text-gray-800">{title}</h2>
        <div className="flex items-center gap-1">
          <div className="relative flex items-center gap-1">
            <motion.div
              key={postedCount}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-sm text-gray-700 italic"
            >
              Posted: <strong className="text-green-700">{postedCount}</strong> / {totalCount}
            </motion.div>
          </div>


          {/* Refresh Button */}
          {onRefresh && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onRefresh}
              disabled={loading}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors shadow-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </motion.button>
          )}
        </div>
      </div>

      {/* Activity log line */}
      <div className="h-5 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {activity && (
            <motion.p
              key={activity.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={`text-[11px] leading-5 italic truncate ${
                activity.type === 'error' ? 'text-red-400' : activity.type === 'success' ? 'text-gray-400' : 'text-gray-300'
              }`}
            >
              {activity.message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ── Hook to manage activity log from parent ── */
let _activitySeq = 0;
export function useActivityLog() {
  const [activity, setActivity] = useState<ActivityLogEntry | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const log = useCallback((type: ActivityLogEntry['type'], message: string, durationMs = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const entry: ActivityLogEntry = { id: ++_activitySeq, type, message, ts: Date.now() };
    setActivity(entry);
    if (durationMs > 0) {
      timerRef.current = setTimeout(() => setActivity(null), durationMs);
    }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { activity, log };
}