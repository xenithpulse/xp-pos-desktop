// models/CashSlip.ts
import { Schema, Document, Types } from "mongoose";

export interface SendToContract {
  bookingId: Types.ObjectId;
  clientName: string;
  bookingUniqueId: string;
  eventTimeAndDate: string;
  hallArea: string;
  guest: number;
}

const SendToContractSchema = new Schema<SendToContract>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    clientName: { type: String },
    bookingUniqueId: { type: String },
    eventTimeAndDate: { type: String },
    hallArea: { type: String },
    guest: { type: Number },
  },
  { _id: false }
);

export interface ICashSlip extends Document {
  _id: Types.ObjectId;
  copyNumber: string;      // e.g., "20"
  uniqueNumber: string;    // e.g., "A41"
  amount: number;
  description: string;
  createdAt: Date;
  used: boolean;
  usedBy: string;
  usedAt: Date;
  signedByCEO: boolean;
  paymentMethod: string;
  addedToContract?: SendToContract[];
  createdBy: string;
}

export const CashSlipSchema = new Schema<ICashSlip>(
  {
    copyNumber: { type: String, required: true },
    uniqueNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedBy: { type: String },
    usedAt: { type: Date },
    signedByCEO: { type: Boolean, default: false },
    paymentMethod: { type: String, default: "cash" },
    createdAt: { type: Date, default: Date.now },
    addedToContract: [SendToContractSchema],
    createdBy: { type: String },
  },
  { timestamps: true }
);