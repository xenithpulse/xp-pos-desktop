// models/factories/SetupState.ts
// Factory for the tenant-scoped SetupState model - singleton pattern.

import { Connection, Model } from 'mongoose';
import { ISetupState, SetupStateSchema, SETUP_STATE_KEY } from '../schemas/setup-state.schema';

export function SetupStateModel(conn: Connection): Model<ISetupState> {
  return conn.models.SetupState || conn.model<ISetupState>('SetupState', SetupStateSchema);
}

/**
 * The singleton setup-state document, created with defaults if absent.
 *
 * A missing document means "nothing has been set up", which is exactly what the
 * schema defaults say, so there is no separate "unknown" case to handle.
 *
 * Upserted on the fixed key rather than read-then-create: the login page and
 * instrumentation both ask this question on a cold boot, and a read-then-create
 * would let both create one.
 */
export async function getSetupState(conn: Connection): Promise<ISetupState> {
  const SetupState = SetupStateModel(conn);
  return SetupState.findOneAndUpdate(
    { k: SETUP_STATE_KEY },
    { $setOnInsert: { k: SETUP_STATE_KEY } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/** Patch the singleton. Creates it if it does not exist yet. */
export async function updateSetupState(
  conn: Connection,
  patch: Partial<Pick<ISetupState,
    'bootstrapped' | 'demoDataLoaded' | 'demoDataSeeding' |
    'defaultCredentialsInUse' | 'defaultUsername' | 'bootstrappedAt' | 'wentLiveAt'>>,
): Promise<ISetupState | null> {
  const SetupState = SetupStateModel(conn);
  return SetupState.findOneAndUpdate(
    { k: SETUP_STATE_KEY },
    { $set: patch, $setOnInsert: { k: SETUP_STATE_KEY } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}
