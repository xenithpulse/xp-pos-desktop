// app/api/admin/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { AdminRole } from "@/models/schemas/admin.schema";
import { isAdminRequest } from "@/lib/auth";
import { extractId } from "@/utils/extractID";
import bcrypt from "bcrypt";


export async function GET(request: NextRequest) {
  const id = extractId(request, 3);
  const denied = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);
  const admin = await Admin.findById(id).lean();
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  return NextResponse.json(admin);
}

interface AdminUpdatePayload {
  username?: string;
  role?: AdminRole;
  isActive?: boolean;
  password?: string;
}

// PUT /api/admin/[id]
export async function PUT(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);
  const data: AdminUpdatePayload = await request.json();

  const update: Partial<AdminUpdatePayload> = {};
  if (data.username     !== undefined) update.username = data.username;
  if (data.role         !== undefined) update.role     = data.role;
  if (data.isActive     !== undefined) update.isActive = data.isActive;
  if (data.password)                   update.password = await bcrypt.hash(data.password, 10);

  const updated = await Admin.findByIdAndUpdate(id, update, { new: true, select: '-password' }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

// DELETE /api/admin/[id]
export async function DELETE(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Admin = AdminModel(conn);
  const deleted = await Admin.findByIdAndDelete(id).lean();
  if (!deleted) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
