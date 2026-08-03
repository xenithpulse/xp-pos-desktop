// app\lib\auth.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { mongooseConnect } from "./mongoose";
import type { AdminPermission, AdminRole } from "@/models/schemas/admin.schema";
import { authOptions } from "./authOptions"; // ✅ Import from correct location
import { licenseWriteGate } from "./licensing/enforce";

interface IsAdminRequestOptions {
  requiredRole?: AdminRole;
  requiredPerm?: AdminPermission;
  /**
   * Mark this handler as a business WRITE, so an unlicensed box refuses it.
   *
   * Opt-in, one route at a time, and deliberately: an expired trial must still
   * let staff finish and pay for the orders that are already open, so "every
   * non-GET request" would be the wrong rule. See lib/licensing/enforce.ts for
   * what is blocked and why.
   *
   * The check runs AFTER authentication, so an unauthenticated caller still
   * gets 401 and learns nothing about the licence state.
   */
  license?: "write";
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

  if (options.license === "write") {
    const denied = await licenseWriteGate();
    if (denied) return denied;
  }
}
