// lib/firstRun.ts
//
// Turning a freshly installed box into a POS somebody can actually use.
//
// A new install has an empty database: no account to sign in with, no menu, no
// tables. Before this existed the only way in was /api/injections/seed-admin,
// which created a super_admin with a hardcoded password - not something a
// customer can be asked to do, and not something that should exist on a
// LAN-facing machine.
//
// What happens now, without anyone being asked to do anything:
//
//   1. An `admin` / `admin` account is created. Deliberately guessable: this is
//      a POS in a box someone has just plugged in, and the alternative is a
//      person standing in front of a login screen they cannot get past.
//   2. The sample menu and floor plan load in the BACKGROUND, so the site is
//      answering requests within a second rather than after a few hundred
//      upserts.
//   3. The POS nags, and then insists. The default password is displayed on the
//      login screen while it is still in use, and removing the sample data -
//      which is what going live means - REQUIRES setting a real one first.
//      See app/api/admin/demo-data/route.ts.
//
// The security tradeoff is deliberate and bounded: a known credential exists
// only while the POS is obviously still a demo, and the one action that turns a
// demo into a real restaurant is the action that closes it.

import { mongooseConnect } from "@/lib/mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { getSetupState, updateSetupState } from "@/models/factories/SetupState";
import { ROLE_PERMISSIONS, type AdminRole } from "@/models/schemas/admin.schema";
import bcrypt from "bcrypt";

export const DEFAULT_USERNAME = "admin";
export const DEFAULT_PASSWORD = "admin";

export interface FirstRunStatus {
  /** An account exists, so the login form is usable. */
  ready: boolean;
  /** The admin account is still on its default password. */
  usingDefaultCredentials: boolean;
  defaultUsername: string;
  defaultPassword: string;
  /** Sample data is loaded, or still loading. */
  demoDataLoaded: boolean;
  demoDataSeeding: boolean;
}

// Only the POSITIVE result is cached, and only in memory. Once an account
// exists the answer can never go back to "no" in a way that matters, so caching
// it makes the login page's check free. Caching a "no" would be a real bug: the
// bootstrap would re-run in this process after another had already done it.
let accountExists = false;

// Dedupes concurrent callers. Next renders pages in parallel and instrumentation
// fires at the same time, so without this the very first request and the boot
// hook race each other into creating two accounts.
let bootstrapInFlight: Promise<void> | null = null;

/** True when at least one admin account exists. Throws if Mongo is unreachable. */
export async function hasAnyAdmin(): Promise<boolean> {
  if (accountExists) return true;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);
  // countDocuments, not estimatedDocumentCount: the estimate is read from
  // collection metadata and can lag a just-completed insert, which is exactly
  // the moment this question gets asked. `limit: 1` stops it at the first hit.
  const count = await Admin.countDocuments({}, { limit: 1 });

  if (count > 0) accountExists = true;
  return count > 0;
}

/**
 * Load the sample menu and floor plan.
 *
 * Imported dynamically: this pulls in three JSON fixtures and the menu models,
 * and there is no reason for that to be in the bundle of every page render that
 * merely asks whether an account exists.
 */
async function seedDemoData(): Promise<void> {
  const conn = await mongooseConnect();

  const state = await getSetupState(conn);
  if (state.demoDataLoaded || state.demoDataSeeding) return;

  await updateSetupState(conn, { demoDataSeeding: true });
  try {
    const [{ seedMenuData }, { seedTableData }] = await Promise.all([
      import("@/lib/demo-data/menu"),
      import("@/lib/demo-data/tables"),
    ]);

    const menu = await seedMenuData(conn);
    const tables = await seedTableData(conn);

    console.log(
      `[first-run] sample data loaded: ${menu.categories.created} categories, ` +
        `${menu.menuItems.created} menu items, ${menu.ingredients.created} ingredients, ` +
        `${tables.tables} tables in ${tables.sections} sections`,
    );
    await updateSetupState(conn, { demoDataLoaded: true, demoDataSeeding: false });
  } catch (err) {
    // Leave demoDataLoaded false so it can be retried, and clear the in-progress
    // flag so a restart is not permanently blocked by one bad run.
    await updateSetupState(conn, { demoDataSeeding: false }).catch(() => {});
    console.error("[first-run] sample data could not be loaded:", err);
  }
}

/**
 * Make sure this installation has an account to sign in with.
 *
 * Fast: it creates one document. Sample data is kicked off but NOT awaited, so
 * the login page is servable immediately - provisioning polls /login to decide
 * whether the install worked, and blocking that on a few hundred menu upserts
 * would make a successful install look like a failed one.
 */
export async function ensureBootstrapped(): Promise<void> {
  if (accountExists) return;
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = (async () => {
    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);

    if ((await Admin.countDocuments({}, { limit: 1 })) > 0) {
      accountExists = true;
      // An account exists but sample data may never have been attempted - for
      // instance an upgrade from a version that predates this. Leave it alone:
      // a POS in service must not suddenly grow a demo menu.
      return;
    }

    const role: AdminRole = "super_admin";
    await Admin.create({
      username: DEFAULT_USERNAME,
      password: await bcrypt.hash(DEFAULT_PASSWORD, 12),
      role,
      permissions: ROLE_PERMISSIONS[role] ?? [],
      isActive: true,
    });
    accountExists = true;

    await updateSetupState(conn, {
      bootstrapped: true,
      bootstrappedAt: new Date(),
      defaultCredentialsInUse: true,
      defaultUsername: DEFAULT_USERNAME,
    });

    console.log(
      `[first-run] created the ${DEFAULT_USERNAME} account with the default password. ` +
        "It must be changed before the sample data can be removed.",
    );

    // Not awaited - see the doc comment.
    void seedDemoData();
  })();

  try {
    await bootstrapInFlight;
  } finally {
    bootstrapInFlight = null;
  }
}

/** Everything the login page needs to decide what to show. */
export async function getFirstRunStatus(): Promise<FirstRunStatus> {
  const conn = await mongooseConnect();
  const state = await getSetupState(conn);

  return {
    ready: accountExists || (await hasAnyAdmin()),
    usingDefaultCredentials: state.defaultCredentialsInUse === true,
    defaultUsername: state.defaultUsername || DEFAULT_USERNAME,
    defaultPassword: DEFAULT_PASSWORD,
    demoDataLoaded: state.demoDataLoaded === true,
    demoDataSeeding: state.demoDataSeeding === true,
  };
}

/** Called when the admin password is changed away from the default. */
export async function markCredentialsChanged(): Promise<void> {
  const conn = await mongooseConnect();
  await updateSetupState(conn, { defaultCredentialsInUse: false });
}
