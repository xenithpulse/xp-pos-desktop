// models/factories/BillAdjustment.ts

import { Connection, Model } from 'mongoose';
import {
  BillAdjustmentSchema,
  IBillAdjustment,
} from '../schemas/billAdjustment.schema';

export function BillAdjustmentModel(conn: Connection): Model<IBillAdjustment> {
  return (
    conn.models.BillAdjustment ||
    conn.model<IBillAdjustment>('BillAdjustment', BillAdjustmentSchema)
  );
}
