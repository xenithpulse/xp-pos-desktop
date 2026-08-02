// models/schemas/billAdjustment.schema.ts
// Bill Adjustment templates — reusable discount/surcharge/GST presets
// managed globally and applied to individual orders.

import { Document, Schema } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Adjustment type — discount reduces total, surcharge increases it
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentKind = 'discount' | 'surcharge' | 'tax' | 'fee';

export const ADJUSTMENT_KIND_LABELS: Record<AdjustmentKind, string> = {
  discount: 'Discount',
  surcharge: 'Surcharge',
  tax: 'Tax / GST',
  fee: 'Fee',
};

// ─────────────────────────────────────────────────────────────────────────────
// Calculation mode
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentCalcMode = 'percentage' | 'fixed';

// ─────────────────────────────────────────────────────────────────────────────
// Bill Adjustment Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface IBillAdjustment extends Document {
  name: string;                  // e.g. "Happy Hour 10%", "GST 18%", "Packaging Fee"
  kind: AdjustmentKind;
  calcMode: AdjustmentCalcMode;
  value: number;                 // percentage or fixed amount
  isDefault: boolean;            // auto-apply to every new order
  isActive: boolean;             // soft-disable without deleting
  appliesTo: 'all' | 'dine_in' | 'takeaway' | 'delivery';
  description?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

export const BillAdjustmentSchema: Schema = new Schema<IBillAdjustment>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    kind: {
      type: String,
      enum: ['discount', 'surcharge', 'tax', 'fee'],
      required: true,
    },
    calcMode: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    value: { type: Number, required: true, min: 0 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    appliesTo: {
      type: String,
      enum: ['all', 'dine_in', 'takeaway', 'delivery'],
      default: 'all',
    },
    description: { type: String, maxlength: 250 },
    sortOrder: { type: Number, default: 0 },
  },
  {
    collection: 'bill_adjustments',
    timestamps: true,
  },
);

BillAdjustmentSchema.index({ kind: 1, isActive: 1 });
BillAdjustmentSchema.index({ isDefault: 1 });
