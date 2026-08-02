'use client';

// Re-export the new CalendarHistory component as DailySheetsHistory for backwards compatibility
export { default } from './CalendarHistory';

// Also export types for external use
export type { DailySheet, ISlipEntry, Entry, IMonthlySheetDocument } from './CalendarHistory/types';
