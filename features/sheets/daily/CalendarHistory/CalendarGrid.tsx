'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { DailySheet } from './types';

interface CalendarGridProps {
  month: number;
  year: number;
  sheets: DailySheet[];
  onSheetClick: (sheet: DailySheet) => void;
  loading?: boolean;
}

export default function CalendarGrid({ month, year, sheets, onSheetClick, loading }: CalendarGridProps) {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const numDays = endOfMonth.getDate();
  const startDayOfWeek = startOfMonth.getDay();

  const sheetMap = new Map<string, DailySheet>();
  sheets.forEach(sheet => {
    const date = new Date(sheet.date);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    sheetMap.set(key, sheet);
  });

  const days = [];
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} className="p-2" />);
  }

  for (let i = 1; i <= numDays; i++) {
    const date = new Date(year, month, i);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const sheet = sheetMap.get(key);
    const isToday = isCurrentMonth && today.getDate() === i;

    const closingBalance = sheet
      ? (sheet.closingBalance || (sheet.openingBalance + sheet.totalIncome - sheet.totalExpense))
      : null;

    days.push(
      <motion.div
        key={i}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: i * 0.01, duration: 0.15 }}
        className={`
          p-2 sm:p-3 rounded-lg cursor-pointer transition-all duration-150 min-h-20 sm:min-h-25
          ${sheet 
            ? 'bg-white hover:bg-black/5 border border-black/10 hover:border-black/20' 
            : 'bg-gray-50/50 border border-transparent'
          }
          ${isToday ? 'ring-2 ring-black ring-offset-1' : ''}
        `}
        onClick={() => sheet && onSheetClick(sheet)}
      >
        <div className={`text-sm font-semibold flex items-center gap-1 ${
          isToday ? 'text-black' : sheet ? 'text-black' : 'text-black/30'
        }`}>
          {i}
          {isToday && <span className="text-[10px] px-1.5 py-0.5 bg-black text-white rounded-full">Today</span>}
        </div>

        {sheet && (
          <div className="mt-1 space-y-0.5 text-xs">
            <div className="text-black/40 hidden sm:block">
              O/B: {sheet.openingBalance?.toLocaleString()}
            </div>
            <div className="text-green-600 font-medium">
              +{sheet.totalIncome?.toLocaleString()}
            </div>
            <div className="text-red-600 font-medium">
              -{sheet.totalExpense?.toLocaleString()}
            </div>
            <div className="text-black font-bold pt-1  hidden sm:block">
              C/B: {closingBalance?.toLocaleString() || '—'}
            </div>
          </div>
        )}

        {loading && !sheet && (
          <div className="mt-2 space-y-1.5 animate-pulse">
            <div className="h-2 bg-black/10 rounded w-3/4" />
            <div className="h-2 bg-black/10 rounded w-1/2" />
          </div>
        )}
      </motion.div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-2">
      {dayNames.map((day, idx) => (
        <div
          key={idx}
          className={`text-center text-xs font-semibold py-2 ${
            idx === 0 || idx === 6 ? 'text-red-600' : 'text-black/50'
          }`}
        >
          <span className="hidden sm:inline">{day}</span>
          <span className="sm:hidden">{day.charAt(0)}</span>
        </div>
      ))}
      {days}
    </div>
  );
}
