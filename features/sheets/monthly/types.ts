import { IExpenseEntry, ISlipEntry } from "@/models/schemas/dailySheet.schema";

export interface IDailySummary {
  dailySheetId: string;
  date?: string;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  slipEntries?: ISlipEntry[];
  entries?: IExpenseEntry[];
}

export interface MonthlySheet {
  _id: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed: boolean;
  dailySummaries: IDailySummary[];
  notes?: string;
}

export interface MonthSummary {
  _id: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed: boolean;
}

export interface LoadingStep {
  id: string;
  label: string;
  completed: boolean;
  active: boolean;
}

// Format helper functions
export const formatLargeNumber = (num: number, limit: number = 100000): string => {
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (absNum >= 10000000) {
    return `${sign}${(absNum / 10000000).toFixed(1)}Cr`;
  }
  if (absNum >= 100000) {
    return `${sign}${(absNum / 100000).toFixed(1)}L`;
  }
  if (absNum >= 1000) {
    return `${sign}${(absNum / 1000).toFixed(0)}K`;
  }
  return `${sign}${absNum.toLocaleString()}`;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatCompactNumber = (num: number): string => {
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  
  if (absNum >= 1000000000) {
    return `${sign}${(absNum / 1000000000).toFixed(2)}B`;
  }
  if (absNum >= 10000000) {
    return `${sign}${(absNum / 10000000).toFixed(2)}Cr`;
  }
  if (absNum >= 100000) {
    return `${sign}${(absNum / 100000).toFixed(2)}L`;
  }
  return formatCurrency(num);
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatDateFull = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
