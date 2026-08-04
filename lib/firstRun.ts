// lib/firstRun.ts
//
// "Has anybody set this installation up yet?"
//
// A freshly installed box has an empty database and therefore no way in: there
// is no account to sign in with. Before this existed the only route to a first
// account was the /api/injections/seed-admin endpoint, which created a
// super_admin with a hardcoded username and password. That is not something a
// customer can be asked to do, and it is not something that should exist on a
// LAN-facing machine at all.
//
// So: while the admins collection is empty, /setup is open and creates the
// owner account. The moment it is not empty, /setup stops existing.

import { mongooseConnect } from "@/lib/mongoose";
import { AdminModel } from "@/models/factories/Admin";

// Only the POSITIVE result is cached, and only in memory.
//
// Once an account exists the answer can never go back to "no" in any way that
// matters, so caching it makes the login page's check free. Caching a "no"
// would be a real bug: the setup page would stay open in this process after
// another process had already created the owner.
let ownerExists = false;

/**
 * True when at least one admin account exists.
 *
 * Throws if the database cannot be reached - callers must decide what an
 * unknown answer means for them. It is never safe to treat "cannot tell" as
 * "no accounts": that would reopen account creation whenever Mongo hiccuped.
 */
export async function hasAnyAdmin(): Promise<boolean> {
  if (ownerExists) return true;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);
  // countDocuments, not estimatedDocumentCount: the estimate is read from
  // collection metadata and can lag a just-completed insert, which is exactly
  // the moment this question gets asked. `limit: 1` stops it at the first hit.
  const count = await Admin.countDocuments({}, { limit: 1 });

  if (count > 0) ownerExists = true;
  return count > 0;
}

/** Called by the setup route once it has created the owner. */
export function markOwnerCreated(): void {
  ownerExists = true;
}
