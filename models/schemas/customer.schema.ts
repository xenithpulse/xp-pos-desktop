// models/schemas/customer.compressed.schema.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Compressed Customer Schema
// Uses short field names and numeric codes to minimize storage and network payload
// ═══════════════════════════════════════════════════════════════════════════════

import { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Value Ranges (for documentation)
// ─────────────────────────────────────────────────────────────────────────────
// Address Label (l): 0=Home, 1=Office, 2=Other
// isDefault (id): 0=false, 1=true

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Customer Address
// ─────────────────────────────────────────────────────────────────────────────

export interface ICompressedCustomerAddress {
  _id?: Types.ObjectId;
  l?: number;                    // label (0=Home, 1=Office, 2=Other)
  l1: string;                    // line1
  l2?: string;                   // line2
  c?: string;                    // city
  pc?: string;                   // postalCode
  in?: string;                   // instructions
  id: number;                    // isDefault (0=false, 1=true)
}

const CompressedCustomerAddressSchema = new Schema<ICompressedCustomerAddress>(
  {
    l: { type: Number, enum: [0, 1, 2], default: 0 },
    l1: { type: String, required: true },
    l2: { type: String },
    c: { type: String },
    pc: { type: String },
    in: { type: String },
    id: { type: Number, enum: [0, 1], default: 0 },
  },
  { _id: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Customer Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ICompressedCustomer extends Document {
  n: string;                     // name
  p?: string;                    // phone
  e?: string;                    // email
  a: ICompressedCustomerAddress[]; // addresses
  nt?: string;                   // notes
  oc: number;                    // orderCount
  ts: number;                    // totalSpent
  lo?: Date;                     // lastOrderAt
  cAt: Date;                     // createdAt
  uAt: Date;                     // updatedAt
}

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Customer Schema
// ─────────────────────────────────────────────────────────────────────────────

export const CompressedCustomerSchema: Schema = new Schema<ICompressedCustomer>(
  {
    n: { type: String, required: true, trim: true },
    p: { type: String, trim: true, index: true },
    e: { type: String, trim: true },
    a: [CompressedCustomerAddressSchema],
    nt: { type: String },
    oc: { type: Number, default: 0, min: 0 },
    ts: { type: Number, default: 0, min: 0 },
    lo: { type: Date },
  },
  {
    collection: 'customers',
    timestamps: { createdAt: 'cAt', updatedAt: 'uAt' },
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes for fast search
// ─────────────────────────────────────────────────────────────────────────────

// Text index for name + phone fuzzy search
CompressedCustomerSchema.index({ n: 'text', p: 'text' });
// Compound index for phone lookup (most common search)
CompressedCustomerSchema.index({ p: 1 });
// Name index for autocomplete
CompressedCustomerSchema.index({ n: 1 });
