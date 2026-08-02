// lib/serverConfig.ts
//
// Shared access to the single ServerConfig document that backs the Server
// Management dashboard. The dashboard is intentionally public (no sign-in), so
// these helpers never assume a session — they just get-or-create the one
// config row and hand it back.

import type { Connection, Model } from "mongoose";
import { mongooseConnect } from "@/lib/mongoose";
import { ServerConfigModel } from "@/models/factories/ServerConfig";
import type { IServerConfig } from "@/models/schemas/server-config.schema";

export interface ServerConfigHandle {
  conn: Connection;
  Model: Model<IServerConfig>;
  config: IServerConfig;
}

/**
 * Return the singleton ServerConfig, creating it with schema defaults on first
 * use. No migration required — the dashboard is self-initialising.
 */
export async function getOrCreateServerConfig(): Promise<ServerConfigHandle> {
  const conn = await mongooseConnect();
  const Model = ServerConfigModel(conn);

  let config = await Model.findOne();
  if (!config) {
    try {
      config = await Model.create({});
    } catch {
      // Another request created it first (the schema enforces a single doc).
      config = await Model.findOne();
    }
  }

  if (!config) {
    throw new Error("Failed to initialise ServerConfig");
  }

  return { conn, Model, config };
}

/**
 * Best-effort reconstruction of the URL the browser used to reach the box,
 * from the proxy's forwarded headers. Shown on the dashboard so whoever is
 * handed the appliance can see the current address without guessing.
 */
export function detectRequestUrl(req: Request): string | null {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return null;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
