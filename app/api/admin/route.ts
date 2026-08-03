// app/api/admin/route.ts

import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";

import { mongooseConnect } from "@//lib/mongoose";
import { isAdminRequest } from "@/lib/auth";

import { AdminModel } from "@/models/factories/Admin";
import { AdminRole, IAdmin } from "@/models/schemas/admin.schema";

const log = console.log;

/* ===================== GET ===================== */
export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);

  try {
    const admins = await Admin.find({}, { password: 0 });
    return NextResponse.json(admins, { status: 200 });
  } catch (e) {
    log("[Admin API][GET]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* ===================== POST ===================== */
export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff", license: "write" });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);

  try {
    const { username, password, role, isActive }: {
      username?: string;
      password?: string;
      role?: AdminRole;
      isActive?: boolean;
    } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { message: "Username and password required" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      username,
      password: hashedPassword,
      role,
      isActive: isActive !== undefined ? isActive : true,
    });

    const { password: _, ...safeAdmin } = admin.toObject();
    return NextResponse.json(safeAdmin, { status: 201 });
  } catch (e) {
    log("[Admin API][POST]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* ===================== PUT ===================== */
export async function PUT(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff", license: "write" });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);

  try {
    const {
      id,
      newUsername,
      newPassword,
      newRole,
    }: {
      id?: string;
      newUsername?: string;
      newPassword?: string;
      newRole?: AdminRole;
    } = await req.json();

    if (!id) {
      return NextResponse.json({ message: "Admin ID required" }, { status: 400 });
    }

    const update: Partial<IAdmin> = {};
    if (newUsername) update.username = newUsername;
    if (newPassword) update.password = await bcrypt.hash(newPassword, 10);
    if (newRole) update.role = newRole;

    const updated = await Admin.findByIdAndUpdate(id, update, {
      new: true,
      select: "-password",
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    log("[Admin API][PUT]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

/* ===================== DELETE ===================== */
export async function DELETE(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff", license: "write" });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);

  try {
    const { deleteId }: { deleteId?: string } = await req.json();

    if (!deleteId) {
      return NextResponse.json({ message: "Admin ID required" }, { status: 400 });
    }

    await Admin.findByIdAndDelete(deleteId);
    return NextResponse.json({ message: "Admin deleted" }, { status: 200 });
  } catch (e) {
    log("[Admin API][DELETE]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
