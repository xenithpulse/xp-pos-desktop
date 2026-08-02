// models/factories/Settings.ts
// Factory for tenant-scoped Settings model — singleton pattern

import { Connection, Model } from 'mongoose';
import { ISettings, SettingsSchema, DEFAULT_SETTINGS } from '../schemas/settings.schema';

/**
 * Return (or create) the Settings model on the given connection.
 */
export function SettingsModel(conn: Connection): Model<ISettings> {
  return conn.models.Settings || conn.model<ISettings>('Settings', SettingsSchema);
}

/**
 * Get the singleton settings document, creating one with defaults if non-existent.
 */
export async function getSettings(conn: Connection): Promise<ISettings> {
  const Settings = SettingsModel(conn);
  let doc = await Settings.findOne().lean<ISettings>();
  if (!doc) {
    doc = (await Settings.create({ ...DEFAULT_SETTINGS })).toObject() as ISettings;
  }
  return doc;
}

/**
 * Upsert the singleton settings document.
 */
export async function upsertSettings(
  conn: Connection,
  updates: Partial<Omit<ISettings, '_id' | 'createdAt' | 'updatedAt'>>,
): Promise<ISettings> {
  const Settings = SettingsModel(conn);
  const doc = await Settings.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, runValidators: true },
  ).lean<ISettings>();
  return doc!;
}
