// models/schemas/counter.schema.ts
// Atomic sequence counters — eliminates duplicate order/session number races.
// Uses findOneAndUpdate($inc) which is guaranteed atomic by MongoDB.

import { Schema } from 'mongoose';

export interface ICounter {
  /** Unique counter identifier, e.g. 'order_20260304' */
  _id: string;
  /** Current sequence value */
  seq: number;
}

export const CounterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  {
    collection: 'counters',
    // No timestamps needed — this is an internal mechanism
    versionKey: false,
  },
);
