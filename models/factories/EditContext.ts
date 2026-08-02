import { Model, Connection } from 'mongoose';
import { IEditContext, EditContextSchema } from '../schemas/editContext.schema';

export function EditContextModel(conn: Connection): Model<IEditContext> {
  return (
    conn.models.EditContext ||
    conn.model<IEditContext>('EditContext', EditContextSchema)
  );
}
