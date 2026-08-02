import { Schema, Document, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Inventory Config — single document holding the module's financial controls.
// Mirrors the cashSlipConfig / voucherConfig singleton pattern.
// ─────────────────────────────────────────────────────────────────────────────

export interface ICashHistoryEntry {
  amount: number;          // the cash-in-hand value it was set to
  note?: string;
  by?: Types.ObjectId;     // admin who set it
  at: Date;
}

export interface IInventoryConfig extends Document {
  cashInHand: number;      // manually-set cash balance
  cashNote?: string;
  cashUpdatedAt?: Date;
  cashUpdatedBy?: Types.ObjectId;
  tierHigh: number;        // value >= tierHigh  → High tier
  tierLow: number;         // value <  tierLow   → Low tier (between = Medium)
  cashHistory: ICashHistoryEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

const CashHistoryEntrySchema = new Schema<ICashHistoryEntry>({
  amount: { type: Number, required: true },
  note: { type: String },
  by: { type: Schema.Types.ObjectId, ref: 'Admin' },
  at: { type: Date, default: Date.now },
}, { _id: true });

export const InventoryConfigSchema: Schema<IInventoryConfig> = new Schema(
  {
    cashInHand: { type: Number, default: 0 },
    cashNote: { type: String },
    cashUpdatedAt: { type: Date },
    cashUpdatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    tierHigh: { type: Number, default: 50000, min: 0 },
    tierLow: { type: Number, default: 10000, min: 0 },
    cashHistory: { type: [CashHistoryEntrySchema], default: [] },
  },
  { timestamps: true }
);
