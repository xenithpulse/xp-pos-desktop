// models\factories\DailySheet.ts

import { Model, Connection } from 'mongoose';
import { IDailySheet, DailySheetSchema } from '../schemas/dailySheet.schema';

export function DailySheetModel(conn: Connection): Model<IDailySheet> {
  return (
    conn.models.DailySheet ||
    conn.model<IDailySheet>('DailySheet', DailySheetSchema)
  );
}