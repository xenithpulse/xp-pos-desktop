import { Model, Connection } from 'mongoose';
import { IStaff, StaffSchema } from '../schemas/staff.schema';

export function StaffModel(conn: Connection): Model<IStaff> {
  return (
    conn.models.Staff ||
    conn.model<IStaff>('Staff', StaffSchema)
  );
}