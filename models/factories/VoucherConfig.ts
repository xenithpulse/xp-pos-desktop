import { Model, Connection } from 'mongoose';
import { IVoucherConfig, VoucherConfigSchema } from '../schemas/voucherConfig.schema';

export function VoucherConfigModel(conn: Connection): Model<IVoucherConfig> {
  return (
    conn.models.VoucherConfig ||
    conn.model<IVoucherConfig>('VoucherConfig', VoucherConfigSchema)
  );
}