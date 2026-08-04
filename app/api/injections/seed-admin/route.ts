// app/api/injections/seed-admin/route.ts
//
// Creates an admin account. A support and development tool, nothing more.
//
// THIS USED TO SHIP A KNOWN PASSWORD, ON AN UNGUARDED GET.
//
// Until the first-run setup page existed this route was the only way to get an
// account onto a fresh install, so it created "reviewer" / "reviewer@123" as a
// super_admin - on a GET, without calling guardInjections at all, which meant
// ENABLE_SETUP_ENDPOINTS did not gate it. Every installation therefore had a
// publicly known super_admin credential creatable by anything on the
// restaurant's network that could fetch a URL.
//
// Customers now create their own owner account at /setup, which needs no flag,
// has no default password, and closes itself permanently once used.
//
// What is left here is:
//   - actually behind guardInjections (ENABLE_SETUP_ENDPOINTS + SETUP_TOKEN)
//   - POST only, so it cannot be fired by loading a URL
//   - unable to invent a password - the caller supplies one
//   - unable to overwrite an existing account

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { mongooseConnect } from "@/lib/mongoose";
import { Types } from "mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { AdminPermission, AdminRole, ROLE_PERMISSIONS } from "@/models/schemas/admin.schema";
import { guardInjections } from "@/lib/injectionsGuard";

export const dynamic = "force-dynamic";

const VALID_ROLES = Object.keys(ROLE_PERMISSIONS) as AdminRole[];

export async function POST(req: NextRequest) {
  const denied = guardInjections(req);
  if (denied) return denied;

  let body: { username?: unknown; password?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = (typeof body.role === "string" ? body.role : "super_admin") as AdminRole;

  if (!username || password.length < 8) {
    return NextResponse.json(
      { success: false, error: "username, and a password of at least 8 characters, are required." },
      { status: 400 },
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { success: false, error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);

    // Create, never upsert. The previous version used findOneAndUpdate with
    // upsert:true, so calling it silently RESET the password of any existing
    // account with that name - including a real owner's.
    if (await Admin.exists({ username })) {
      return NextResponse.json(
        { success: false, error: `An account named "${username}" already exists.` },
        { status: 409 },
      );
    }

    const permissions: AdminPermission[] = ROLE_PERMISSIONS[role] || [];
    const admin = await Admin.create({
      username,
      password: await bcrypt.hash(password, 12),
      role,
      permissions,
      isActive: true,
    });

    const objectId = admin._id as unknown as Types.ObjectId;
    return NextResponse.json(
      {
        success: true,
        message: `Admin "${username}" created with ${role} permissions.`,
        adminId: objectId.toString(),
        assignedPermissions: permissions,
      },
      { status: 201 },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Seed Admin Error:", err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
