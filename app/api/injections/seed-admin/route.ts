// app/api/seed-admin/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { mongooseConnect } from "@/lib/mongoose";
import { Types } from "mongoose";
import { AdminModel } from "@/models/factories/Admin";
import { AdminPermission, AdminRole, ROLE_PERMISSIONS } from "@/models/schemas/admin.schema";

export async function GET() {
  try {
    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);
    const username = "reviewer";
    const rawPassword = "reviewer@123";

    const saltRounds = 10;
    const hashed = await bcrypt.hash(rawPassword, saltRounds);

    const role: AdminRole = "super_admin"; // Defined here for reuse
    const permissions = ROLE_PERMISSIONS[role] || [];

    const payload = {
      username,
      password: hashed,
      role,
      permissions,
      isActive: true,
    };

    const admin = await Admin.findOneAndUpdate(
      { username },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
        const objectId = admin._id as unknown as Types.ObjectId;

    return NextResponse.json(
      {
        success: true,
        message: `Admin "${username}" seeded with ${role} permissions.`,
        adminId: objectId.toString(),
        assignedPermissions: permissions,
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    console.error("Seed Admin Error:", err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
