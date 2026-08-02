// models\factories\MonthlySheet.ts
import { Model, Connection } from 'mongoose';
import { IMonthlySheet, MonthlySheetSchema } from '../schemas/monthlySheet.schema';

export function MonthlySheetModel(conn: Connection): Model<IMonthlySheet> {
  return (
    conn.models.MonthlySheet ||
    conn.model<IMonthlySheet>('MonthlySheet', MonthlySheetSchema)
  );
}