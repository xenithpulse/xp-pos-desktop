// models/factories/ServerConfig.ts

import { Connection, Model } from "mongoose";
import { ServerConfigSchema, IServerConfig } from "../schemas/server-config.schema";

export function ServerConfigModel(conn: Connection): Model<IServerConfig> {
  return (
    conn.models.ServerConfig ||
    conn.model<IServerConfig>("ServerConfig", ServerConfigSchema)
  );
}
