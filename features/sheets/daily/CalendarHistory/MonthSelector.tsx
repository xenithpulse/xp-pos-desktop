'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaDatabase } from 'react-icons/fa';

interface MonthSelectorProps {
  month: number;
  year: number;
  onMonthChange: (direction: 'prev' | 'next') => void;
  onMonthSelect?: (month: number, year: number) => void;
  isCached?: boolean;
  loading?: boolean;
}

export default function MonthSelector({
  month,
  year,
  onMonthChange,
  isCached,
  loading,
}: MonthSelectorProps) {
  const currentDate = new Date();
  const isCurrentMonth = currentDate.getMonth() === month && currentDate.getFullYear() === year;
  const isFutureMonth = new Date(year, month) > new Date(currentDate.getFullYear(), currentDate.getMonth());

  const monthName = new Date(year, month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-linear-to-r from-slate-50 to-white rounded-xl border border-gray-100">
      {/* Navigation */}
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onMonthChange('prev')}
          className="p-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          aria-label="Previous month"
        >
          <FaChevronLeft className="text-gray-600" />
        </motion.button>

        <div className="flex items-center gap-2 min-w-50 justify-center">
          <FaCalendarAlt className="text-blue-500" />
          <h3 className="text-lg sm:text-xl font-bold text-gray-800">
            {monthName}
          </h3>
          {loading && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onMonthChange('next')}
          disabled={isFutureMonth}
          className={`p-2.5 rounded-lg bg-white border border-gray-200 transition-all shadow-sm ${
            isFutureMonth 
              ? 'opacity-50 cursor-not-allowed' 
              : 'hover:bg-gray-50 hover:border-gray-300'
          }`}
          aria-label="Next month"
        >
          <FaChevronRight className="text-gray-600" />
        </motion.button>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3">
        {isCurrentMonth && (
          <span className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-full border border-blue-100">
            Current Month
          </span>
        )}
        {isCached && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-600 bg-green-50 rounded-full border border-green-100">
            <FaDatabase size={10} />
            Cached
          </span>
        )}
      </div>
    </div>
  );
}
