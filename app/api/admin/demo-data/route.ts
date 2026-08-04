// app/api/admin/demo-data/route.ts
//
// "I have finished trying it out - this is now my real restaurant."
//
// A fresh install comes preloaded with a sample menu and floor plan, and an
// `admin` / `admin` account, so that somebody who has just plugged the box in
// can get in and use the thing. Both are demo affordances. This endpoint is
// where they are given up.
//
// The two are handled TOGETHER, deliberately. Removing the sample data is the
// moment a demo becomes a real restaurant, and it is the only moment where
// asking for a real password is obviously reasonable rather than an
// interruption. Doing it any earlier gets clicked past; doing it later never
// happens at all. So: you cannot remove the sample data while the account is
// still on its default password.
//
// GET  - what state is this installation in?
// PUT  - load the sample data.
// POST - set a real password and remove the sample data.
//
// PUT exists because the panel was otherwise a dead end. Bootstrap deliberately
// does NOT seed a box that already has an account (an upgrade of a POS in
// service must not suddenly grow a demo menu), so every existing installation
// showed "no sample data is loaded" with no way to load any - including the
// developer's own machine, which is where it was noticed.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { isAdminRequest, getSession } from "@/lib/auth";
import { mongooseConnect } from "@/lib/mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { getSetupState, updateSetupState } from "@/models/factories/SetupState";
import { removeMenuData, seedMenuData, demoMenuNames } from "@/lib/demo-data/menu";
import { removeTableData, seedTableData, demoTableNumbers } from "@/lib/demo-data/tables";
import { markCredentialsChanged } from "@/lib/firstRun";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

// The three passwords people actually type when a screen asks them to invent
// one. Not a dictionary check - a backstop against defeating the point of this
// endpoint by changing "admin" to "admin123".
const BANNED_PASSWORDS = new Set([
  "admin", "admin1", "admin123", "administrator",
  "password", "password1", "password123",
  "12345678", "123456789", "qwertyui", "xppos123", "restaurant",
]);

export async function GET() {
  const denied = await isAdminRequest({ requiredRole: "super_admin" });
  if (denied) return denied;

  try {
    const conn = await mongooseConnect();
    const state = await getSetupState(conn);

    return NextResponse.json({
      demoDataLoaded: state.demoDataLoaded === true,
      demoDataSeeding: state.demoDataSeeding === true,
      usingDefaultPassword: state.defaultCredentialsInUse === true,
      wentLiveAt: state.wentLiveAt ?? null,
      counts: {
        menuItems: demoMenuNames().menuItems.length,
        categories: demoMenuNames().categories.length,
        ingredients: demoMenuNames().ingredients.length,
        tables: demoTableNumbers().length,
      },
    });
  } catch (err) {
    console.error("[demo-data] status failed:", err);
    return NextResponse.json({ error: "Could not read the setup state." }, { status: 500 });
  }
}

/**
 * Load the sample menu, ingredients and floor plan.
 *
 * Safe to run on a POS already in use: everything is upserted by name, and a
 * table number that already exists is left alone rather than moved out from
 * under whoever positioned it.
 */
export async function PUT() {
  const denied = await isAdminRequest({ requiredRole: "super_admin" });
  if (denied) return denied;

  try {
    const conn = await mongooseConnect();
    const state = await getSetupState(conn);

    if (state.demoDataSeeding) {
      return NextResponse.json(
        { error: "Sample data is already being loaded. Give it a moment." },
        { status: 409 },
      );
    }

    await updateSetupState(conn, { demoDataSeeding: true });
    try {
      const menu = await seedMenuData(conn);
      const tables = await seedTableData(conn);
      await updateSetupState(conn, { demoDataLoaded: true, demoDataSeeding: false });

      return NextResponse.json({
        ok: true,
        loaded: {
          categories: menu.categories.created,
          menuItems: menu.menuItems.created,
          ingredients: menu.ingredients.created,
          tables: tables.tables,
          sections: tables.sections,
        },
        // Reported rather than swallowed: a table number that was already in
        // use is why the count can come back lower than expected.
        tablesAlreadyPresent: tables.skipped,
      });
    } catch (err) {
      // Clear the in-progress flag so one bad run does not block retrying.
      await updateSetupState(conn, { demoDataSeeding: false }).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("[demo-data] load failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the sample data." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await isAdminRequest({ requiredRole: "super_admin" });
  if (denied) return denied;

  const session = await getSession();
  const username = session?.user?.name;
  if (!username) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { newPassword?: unknown; includeIngredients?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const includeIngredients = body.includeIngredients === true;

  try {
    const conn = await mongooseConnect();
    const state = await getSetupState(conn);
    const Admin = AdminModel(conn);

    // ── The gate ─────────────────────────────────────────────────────────
    if (state.defaultCredentialsInUse) {
      if (newPassword.length < MIN_PASSWORD) {
        return NextResponse.json(
          {
            error:
              `Set a password of at least ${MIN_PASSWORD} characters first. ` +
              "This POS is about to hold real business data and it is reachable " +
              "by every device on your network.",
            needsPassword: true,
          },
          { status: 400 },
        );
      }
      if (BANNED_PASSWORDS.has(newPassword.toLowerCase())) {
        return NextResponse.json(
          { error: "That password is too easy to guess. Please choose another.", needsPassword: true },
          { status: 400 },
        );
      }
      if (newPassword.toLowerCase() === username.toLowerCase()) {
        return NextResponse.json(
          { error: "The password cannot be the same as the username.", needsPassword: true },
          { status: 400 },
        );
      }

      // Change the password BEFORE deleting anything. If the update fails, the
      // site is left exactly as it was - still a demo, still reachable - rather
      // than stripped of its sample data and still on a known password, which
      // is the worst of both.
      const updated = await Admin.updateOne(
        { username },
        { $set: { password: await bcrypt.hash(newPassword, 12) } },
      );
      if (updated.matchedCount === 0) {
        return NextResponse.json({ error: "Could not find your account to update." }, { status: 500 });
      }

      // markCredentialsChanged does the write. Calling updateSetupState here as
      // well would be the same operation twice.
      await markCredentialsChanged();
    }

    // ── The removal ──────────────────────────────────────────────────────
    const menu = await removeMenuData(conn, { includeIngredients });
    const tables = await removeTableData(conn);

    await updateSetupState(conn, { demoDataLoaded: false, wentLiveAt: new Date() });

    return NextResponse.json({
      ok: true,
      passwordChanged: state.defaultCredentialsInUse === true,
      removed: {
        menuItems: menu.menuItems,
        categories: menu.categories,
        ingredients: menu.ingredients,
        tables: tables.tables,
        sections: tables.sections,
      },
      // Surfaced rather than swallowed: a table that was busy is still there,
      // and the person who just clicked this needs to know why.
      tablesLeftInPlace: tables.inUse,
    });
  } catch (err) {
    console.error("[demo-data] removal failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not remove the sample data." },
      { status: 500 },
    );
  }
}
