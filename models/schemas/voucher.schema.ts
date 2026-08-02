import { Schema, Document, Types } from 'mongoose';
import { IDailySheet } from './dailySheet.schema';

export interface IVoucher extends Document {
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  createdAt: Date;
  expenseEntry: IDailySheet['_id'];
  postedAt: Date;
  postedBy: string;
}

export const VoucherSchema = new Schema<IVoucher>(
  {
    copyNumber: { type: String, required: true },
    uniqueNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expenseEntry: { 
      type: Schema.Types.ObjectId,
      ref: 'DailySheet',
      required: false,
      unique: true  // prevents double-posting same expense
    },
    postedAt: { type: Date, default: Date.now },
    postedBy: { type: String }, // if you have users
  },
    { timestamps: true },  
);
