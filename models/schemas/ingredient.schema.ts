import { Schema, Document, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Stock Delta - Tracks every stock change (restock, deduction, adjustment)
// ─────────────────────────────────────────────────────────────────────────────

export type DeltaReason =
  | 'restock'
  | 'order_deduction'
  | 'manual_adjustment'
  | 'waste'
  | 'return'
  | 'stock_take'
  | 'transfer';

export const DELTA_REASONS: DeltaReason[] = [
  'restock',
  'order_deduction',
  'manual_adjustment',
  'waste',
  'return',
  'stock_take',
  'transfer',
];

export interface IStockDelta {
  _id?: Types.ObjectId;
  qty: number;             // positive = added, negative = deducted
  reason: DeltaReason;
  orderId?: Types.ObjectId; // linked order (for order_deduction)
  unitCost?: number;        // price per unit at time of purchase (for restock/purchase)
  balanceAfter?: number;    // stock level immediately after this delta (for reports)
  note?: string;
  by?: Types.ObjectId;      // admin who made the change
  at: Date;
}

const StockDeltaSchema = new Schema<IStockDelta>({
  qty: { type: Number, required: true },
  reason: {
    type: String,
    enum: DELTA_REASONS,
    required: true,
  },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  unitCost: { type: Number, min: 0 },
  balanceAfter: { type: Number },
  note: { type: String },
  by: { type: Schema.Types.ObjectId, ref: 'Admin' },
  at: { type: Date, default: Date.now },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient Interface
// ─────────────────────────────────────────────────────────────────────────────

export type IngredientKind = 'ingredient' | 'supply';

export interface IIngredientBase {
  name: string;
  stock: number;
  unit: string;
  costPerUnit?: number;      // manual / fallback cost per unit
  avgCost?: number;          // weighted-average purchase cost
  lastCost?: number;         // last purchase price per unit
  lowStockThreshold: number;
  // Classification
  kind: IngredientKind;      // 'ingredient' (recipe) or 'supply' (non-recipe)
  category?: string;         // free text, e.g. "Produce", "Packaging", "Cleaning"
  supplier?: string;
  // Usage stats
  totalConsumed: number;
  totalRestocked: number;
  deltas: IStockDelta[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IIngredient extends IIngredientBase, Document {
  _id: Types.ObjectId;
}
export interface IIngredientLean extends IIngredientBase {
  _id: string;
}

export const IngredientSchema: Schema<IIngredient> = new Schema(
  {
    name: { type: String, required: true, trim: true },
    stock: { type: Number, default: 0 },
    unit: { type: String, required: true },
    costPerUnit: { type: Number, min: 0 },
    avgCost: { type: Number, min: 0 },
    lastCost: { type: Number, min: 0 },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    // Classification
    kind: { type: String, enum: ['ingredient', 'supply'], default: 'ingredient' },
    category: { type: String, trim: true },
    supplier: { type: String, trim: true },
    // Usage stats
    totalConsumed: { type: Number, default: 0, min: 0 },
    totalRestocked: { type: Number, default: 0, min: 0 },
    // Stock history
    deltas: { type: [StockDeltaSchema], default: [] },
  },
  { timestamps: true }
);