import { Model, Connection } from 'mongoose';
import { ISlipConfig, SlipConfigSchema } from '../schemas/cashSlipConfig.schema';

export function SlipConfigModel(conn: Connection): Model<ISlipConfig> {
  return (
    conn.models.SlipConfig ||
    conn.model<ISlipConfig>('SlipConfig', SlipConfigSchema)
  );
}