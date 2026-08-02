import { Schema, Document } from 'mongoose';

export interface IDailySummary {
  dailySheetId: Schema.Types.ObjectId | string;
  date?: Date;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  slipEntries?: {
    copyNumber?: string;
    uniqueNumber?: string;
    amount?: number;
    description?: string;
  }[];
  entries?: {
    category?: string;
    description?: string;
    amount?: number;
  }[];
}

export interface IMonthlySheet extends Document {
  monthLabel: string;
  startDate: Date;
  endDate: Date;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed: boolean;
  dailySummaries: IDailySummary[];
  notes?: string;
}

const DailySummarySchema = new Schema<IDailySummary>(
  {
    dailySheetId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date },
    totalIncome: { type: Number, default: 0 },
    totalExpense: { type: Number, default: 0 },
    closingBalance: { type: Number, default: 0 },
    slipEntries: [
      {
        copyNumber: String,
        uniqueNumber: String,
        amount: Number,
        description: String,
      },
    ],
    entries: [
      {
        category: String,
        description: String,
        amount: Number,
      },
    ],
  },
  { _id: false }
);

export const MonthlySheetSchema = new Schema<IMonthlySheet>(
  {
    monthLabel: { type: String, required: true, unique: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    openingBalance: { type: Number, required: true },
    closingBalance: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    totalExpense: { type: Number, default: 0 },
    isClosed: { type: Boolean, default: false },
    dailySummaries: [DailySummarySchema],
    notes: String,
  },
  { timestamps: true }
);