import { Model, Connection } from 'mongoose';
import { IVoucher, VoucherSchema } from '../schemas/voucher.schema';

export function VoucherModel(conn: Connection): Model<IVoucher> {
  return (
    conn.models.Voucher ||
    conn.model<IVoucher>('Voucher', VoucherSchema)
  );
}