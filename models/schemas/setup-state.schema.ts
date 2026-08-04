// models/schemas/setup-state.schema.ts
//
// A singleton record of how far this installation has been set up.
//
// It answers three questions that nothing else can answer reliably:
//
//   1. Has first-run bootstrap already happened? (so it runs exactly once)
//   2. Is the sample data currently loaded? (so the POS can offer to remove it,
//      and can tell whether an empty menu means "removed" or "never seeded")
//   3. Is the admin account still on its default password? (so the POS can
//      insist on a real one before the site goes live)
//
// Question 3 could be answered by bcrypt-comparing the stored hash against
// "admin", but that would mean the string "admin" living in the auth path
// forever. A flag set at creation and cleared on change is explicit, and it
// survives the owner choosing "admin" again as their real password.

import { Document, Schema } from 'mongoose';

/**
 * The one and only key this collection uses.
 *
 * Without it, "the singleton" is whatever findOne happens to return, and two
 * concurrent first-time callers - the login page and instrumentation, which
 * genuinely do race on a cold boot - each create their own document. State then
 * splits across two records and the POS disagrees with itself about whether it
 * has been set up. A fixed key plus a unique index makes the upsert atomic and
 * a second document impossible.
 */
export const SETUP_STATE_KEY = "singleton";

export interface ISetupState extends Document {
  /** Always SETUP_STATE_KEY. Unique, so there can only ever be one document. */
  k: string;
  /** First-run bootstrap has completed (the admin account exists). */
  bootstrapped: boolean;
  /** The sample menu and floor plan are currently loaded. */
  demoDataLoaded: boolean;
  /** Sample data seeding is running right now. Guards against a double run. */
  demoDataSeeding: boolean;
  /** The admin account has never had its password changed from the default. */
  defaultCredentialsInUse: boolean;
  /** The username created by bootstrap, so the login hint names the right one. */
  defaultUsername?: string;
  bootstrappedAt?: Date;
  /** When the sample data was removed and a real password set. */
  wentLiveAt?: Date;
}

export const SetupStateSchema: Schema = new Schema<ISetupState>(
  {
    k: { type: String, required: true, unique: true, default: SETUP_STATE_KEY },
    bootstrapped: { type: Boolean, default: false },
    demoDataLoaded: { type: Boolean, default: false },
    demoDataSeeding: { type: Boolean, default: false },
    defaultCredentialsInUse: { type: Boolean, default: false },
    defaultUsername: { type: String },
    bootstrappedAt: { type: Date },
    wentLiveAt: { type: Date },
  },
  { collection: 'setup_state' },
);
