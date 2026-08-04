// app/api/setup/owner/route.ts
//
// Creates the owner account on a brand-new installation, once.
//
// This is the replacement for seeding an admin through /api/injections. It is
// safe to leave enabled because it is self-closing: it works only while the
// admins collection is empty, and a POS with an owner is a POS where this route
// returns 409 forever.
//
// It is NOT behind ENABLE_SETUP_ENDPOINTS. That flag guards endpoints which
// stay dangerous for as long as they are switched on; this one disarms itself,
// and requiring a customer to edit a .env file before they can log in is the
// problem being solved rather than a security control.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { mongooseConnect } from "@/lib/mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { ROLE_PERMISSIONS, type AdminRole } from "@/models/schemas/admin.schema";
import { hasAnyAdmin, markOwnerCreated } from "@/lib/firstRun";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;
const MIN_USERNAME = 3;
const MAX_USERNAME = 32;

// Rejected outright regardless of length. Short list on purpose: this is a
// backstop against the three passwords people actually type when a screen asks
// them to invent one, not an attempt at a dictionary check.
const BANNED_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwertyui",
  "admin123",
  "letmein1",
  "xppos123",
]);

export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (username.length < MIN_USERNAME || username.length > MAX_USERNAME) {
    return NextResponse.json(
      { error: `Username must be between ${MIN_USERNAME} and ${MAX_USERNAME} characters.` },
      { status: 400 },
    );
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return NextResponse.json(
      { error: "Username can contain only letters, numbers, dots, dashes and underscores." },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 },
    );
  }
  if (BANNED_PASSWORDS.has(password.toLowerCase())) {
    return NextResponse.json(
      { error: "That password is too easy to guess. Please choose another." },
      { status: 400 },
    );
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    return NextResponse.json(
      { error: "The password cannot be the same as the username." },
      { status: 400 },
    );
  }

  try {
    if (await hasAnyAdmin()) {
      return NextResponse.json(
        { error: "This POS has already been set up. Sign in instead." },
        { status: 409 },
      );
    }

    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);

    // The check above and this insert are not one atomic operation, so two
    // people submitting this form in the same second would both get an owner
    // account. That is tolerable: the window exists only on a machine where
    // nobody has ever signed in, on a private network, and both accounts would
    // belong to the same business. Closing it properly would need a lock
    // collection, which is a lot of machinery for a several-second window that
    // occurs once in an installation's life.
    const role: AdminRole = "super_admin";
    await Admin.create({
      username,
      password: await bcrypt.hash(password, 12),
      role,
      permissions: ROLE_PERMISSIONS[role] ?? [],
      isActive: true,
    });

    markOwnerCreated();

    // Deliberately returns nothing about the account and does not sign the
    // user in. They go to the login page and use what they just chose, which
    // confirms the credentials work while they are still sitting in front of it.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // A duplicate key here means a concurrent request won the race described
    // above. From this caller's point of view the POS is now set up.
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }
    console.error("Owner setup failed:", err);
    return NextResponse.json(
      { error: "Could not reach the database. Please try again in a moment." },
      { status: 500 },
    );
  }
}
