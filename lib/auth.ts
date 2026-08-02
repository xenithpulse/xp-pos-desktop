// app\lib\auth.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { mongooseConnect } from "./mongoose";
import type { AdminPermission, AdminRole } from "@/models/schemas/admin.schema";
import { authOptions } from "./authOptions"; // ✅ Import from correct location

interface IsAdminRequestOptions {
  requiredRole?: AdminRole;
  requiredPerm?: AdminPermission;
}

// Helper to get the current session
export async function getSession() {
  return getServerSession(authOptions);
}

export async function isAdminRequest(
  options: IsAdminRequestOptions = {}
): Promise<NextResponse | void> {
  await mongooseConnect();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized: Admin only." },
      { status: 401 }
    );
  }

  const { role, permissions } = session.user;
  if (options.requiredRole && role !== options.requiredRole) {
    return NextResponse.json(
      {
        error: `Forbidden: requires role "${options.requiredRole}", you have "${role}".`,
      },
      { status: 403 }
    );
  }
  if (options.requiredPerm && !permissions.includes(options.requiredPerm)) {
    return NextResponse.json(
      { error: `Forbidden: requires permission "${options.requiredPerm}".` },
      { status: 403 }
    );
  }
}
