import { Schema, Document, Types } from 'mongoose';
import { IVoucher } from './voucher.schema';

export type PaymentMethod = 'cash' | 'cheque' | 'online';

/** Booking summary snapshotted onto a slip entry (mirrors CashSlip.addedToContract). */
export interface ISlipBookingLink {
  bookingId?: string;
  clientName?: string;
  bookingUniqueId?: string;
  eventTimeAndDate?: string;
  hallArea?: string;
  guest?: number;
}

export interface ISlipEntry {
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  /** Payment method copied from the source CashSlip (default cash). */
  paymentMethod?: PaymentMethod;
  /** Snapshot of the source slip's booking links at time of usage. */
  bookings?: ISlipBookingLink[];
}

/** Optional multi-line breakdown attached to an expense entry. */
export interface IExpenseLine {
  groupName?: string;
  subCategory?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  description?: string;
}

/** Trace attached to an expense auto-imported from a booking's Event Profitability. */
export interface IExpenseBookingRef {
  bookingId?: string;
  bookingUniqueId?: string;
  eventDate?: string;
  clientName?: string;
  sourceUpdateCount?: number;
  source?: string;
}

export interface IExpenseEntry {
  category: string;
  description: string;
  amount: number;
  isExpPosted: boolean;
  expID: string;
  postedCopyNumber: string;
  postedUniqueNumber: string;
  /** Payment method for the expense (default cash). */
  paymentMethod?: PaymentMethod;
  /** Optional itemized breakdown (sum validated against amount server-side). */
  lines?: IExpenseLine[];
  vendorId?: Types.ObjectId | string | null;
  vendorName?: string | null;
  /** Present when auto-imported from a booking's Event Profitability. */
  bookingRef?: IExpenseBookingRef;
}

export interface IDailySheet extends Document {
  date: Date;
  slipEntries: ISlipEntry[];
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  openingBalance: number;
  /** Per-payment-method opening balances carried forward from the prior day. */
  cashOpeningBalance: number;
  onlineOpeningBalance: number;
  /** Per-payment-method closing balances (open + income − expense, per method). */
  cashClosingBalance: number;
  onlineClosingBalance: number;
  notes?: string;
  entries: Types.DocumentArray<IExpenseEntry>;
  voucherRef: IVoucher['_id'];
  isPosted: boolean;
}

/** Booking link subdocument (no own _id — pure snapshot). */
const SlipBookingLinkSchema = new Schema<ISlipBookingLink>(
  {
    bookingId: String,
    clientName: String,
    bookingUniqueId: String,
    eventTimeAndDate: String,
    hallArea: String,
    guest: Number,
  },
  { _id: false }
);

const ExpenseLineSchema = new Schema<IExpenseLine>(
  {
    groupName: String,
    subCategory: String,
    unit: String,
    quantity: Number,
    rate: Number,
    amount: { type: Number, default: 0 },
    description: String,
  },
  { _id: false }
);

const ExpenseBookingRefSchema = new Schema<IExpenseBookingRef>(
  {
    bookingId: String,
    bookingUniqueId: String,
    eventDate: String,
    clientName: String,
    sourceUpdateCount: Number,
    source: String,
  },
  { _id: false }
);

export const DailySheetSchema = new Schema<IDailySheet>(
  {
    date:           { type: Date,   required: true, unique: true },
    slipEntries:    [
      {
        copyNumber:    String,
        uniqueNumber:  String,
        amount:        Number,
        description:   String,
        paymentMethod: { type: String, enum: ['cash', 'cheque', 'online'], default: 'cash' },
        bookings:      { type: [SlipBookingLinkSchema], default: [] },
      },
    ],
    totalIncome:    { type: Number, required: true },
    totalExpense:   { type: Number, required: true },
    closingBalance: { type: Number, required: true },
    openingBalance: { type: Number, required: true, default: 0 },
    // Per-method opening/closing. Default 0 so legacy documents (which lack
    // these fields) read as a "collapsed" split and the client reconciles them
    // against the opening-balance API.
    cashOpeningBalance:   { type: Number, default: 0 },
    onlineOpeningBalance: { type: Number, default: 0 },
    cashClosingBalance:   { type: Number, default: 0 },
    onlineClosingBalance: { type: Number, default: 0 },
    notes:          { type: String },
    entries:        [
      {
        category:    String,
        description: String,
        amount:      Number,
        isExpPosted: Boolean,
        expID: String,
        postedCopyNumber: String,
        postedUniqueNumber: String,
        paymentMethod: { type: String, enum: ['cash', 'cheque', 'online'], default: 'cash' },
        lines:      { type: [ExpenseLineSchema], default: undefined },
        vendorId:   { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
        vendorName: { type: String, default: null },
        bookingRef: { type: ExpenseBookingRefSchema, default: undefined },
      },
    ],
    voucherRef: {
      type: Schema.Types.ObjectId,
      ref: 'Voucher',
      default: null
    },
    isPosted: { type: Boolean, default: false },
  },
  { timestamps: true }
);
