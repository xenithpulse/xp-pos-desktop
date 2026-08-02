import { Model, Connection } from 'mongoose';
import { IInventoryConfig, InventoryConfigSchema } from '../schemas/inventoryConfig.schema';

export function InventoryConfigModel(conn: Connection): Model<IInventoryConfig> {
  return (
    conn.models.InventoryConfig ||
    conn.model<IInventoryConfig>('InventoryConfig', InventoryConfigSchema)
  );
}

/**
 * Fetch the singleton inventory config, creating it with defaults if missing.
 */
export async function getInventoryConfig(conn: Connection): Promise<IInventoryConfig> {
  const Model = InventoryConfigModel(conn);
  let cfg = await Model.findOne();
  if (!cfg) {
    cfg = await Model.create({});
  }
  return cfg;
}
