// Types for Calendar History module
import { IDailySummary } from '@/models/schemas/monthlySheet.schema';

export interface IMonthlySheetDocument {
  _id: string;
  month: number;
  year: number;
  openingBalance?: number;
  closingBalance: number;
  startDate: Date;
  dailySummaries: IDailySummary[];
}

export interface ISlipBookingLink {
  bookingId?: string;
  clientName?: string;
  bookingUniqueId?: string;
  eventTimeAndDate?: string;
  hallArea?: string;
  guest?: number;
}

export interface ISlipEntry {
  _id?: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  paymentMethod?: 'cash' | 'cheque' | 'online';
  bookings?: ISlipBookingLink[];
  slipCreatedAt?: string | Date;
  /** v2 — direct snapshot of source CashSlip's clientName (used when the
   *  slip is not attached to any booking, e.g. Daily Sheet v2 / Ledger flow). */
  clientName?: string;
  /** v2 — direct snapshot of source CashSlip's eventDate. The slip's
   *  `description` is the Event ID (e.g. "A-356"). */
  eventDate?: string | Date;
}

export interface IExpenseLine {
  groupName?: string;
  subCategory?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  description?: string;
}

export interface Entry {
  _id?: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: 'cash' | 'cheque' | 'online' | 'card' | 'bank_transfer';
  postedCopyNumber?: string | null;
  postedUniqueNumber?: string | null;
  createdAt?: string | Date;
  /** Per-item breakdown for multi-line expenses (Mutton: Qorma 66kg, Champ 10kg…). */
  lines?: IExpenseLine[];
  vendorId?: string | null;
  vendorName?: string | null;
}

export interface DailySheet {
  _id: string;
  sheetNumber?: number;
  date: string;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  openingBalance: number;
  cashOpeningBalance?: number;
  onlineOpeningBalance?: number;
  cashClosingBalance?: number;
  onlineClosingBalance?: number;
  cashIncome?: number;
  chequeIncome?: number;
  onlineIncome?: number;
  cashPayment?: number;
  chequePayment?: number;
  onlinePayment?: number;
  notes?: string;
  slipEntries: ISlipEntry[];
  entries: Entry[];
  createdAt?: string | Date;
}

export interface MonthCacheEntry {
  sheets: DailySheet[];
  fetchedAt: number;
  expiresAt: number;
}

export interface CacheStats {
  totalCached: number;
  months: string[];
  oldestEntry: number | null;
  newestEntry: number | null;
}

export interface MonthlyFetchParams {
  month: number;
  year: number;
}

export interface SearchParams {
  query: string;
  month?: number;
  year?: number;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  sheets: DailySheet[];
  total: number;
  query: string;
}
