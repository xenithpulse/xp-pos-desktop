import { Schema, Document } from 'mongoose';

export interface IVoucherConfig extends Document {
  currentCopyNumber: string;
  uniqueNumberPrefix: string;
  start: number;
  limit: number;
  updatedAt: Date;
  createdAt?: Date;
}

export const VoucherConfigSchema: Schema<IVoucherConfig> = new Schema(
  {
    currentCopyNumber: { type: String, required: true },
    uniqueNumberPrefix: { type: String, required: true },
    start: { type: Number, required: true, default: 1 },
    limit: { type: Number, required: true, default: 20 },
  },
  { timestamps: true }
);