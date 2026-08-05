// app\lib\auth.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { mongooseConnect } from "./mongoose";
import type { AdminPermission, AdminRole } from "@/models/schemas/admin.schema";
import { authOptions } from "./authOptions"; // ✅ Import from correct location
import { resolvePermissions } from "@/types/admin.types";
import { licenseWriteGate } from "./licensing/enforce";

interface IsAdminRequestOptions {
  requiredRole?: AdminRole;
  requiredPerm?: AdminPermission;
  /**
   * Any ONE of these is enough.
   *
   * Exists because several permissions can legitimately reach the same route.
   * Taking a takeaway order and taking a dine-in order hit the same order
   * endpoints, but the people doing them hold different permissions - a
   * takeaway-only account has `manage_takeaway` and nothing else, and a single
   * `requiredPerm: 'manage_orders'` locks it out of its own workspace.
   *
   * Combines with requiredPerm as AND: requiredPerm must be held, and at least
   * one of anyPerm must be held. In practice routes use one or the other.
   */
  anyPerm?: AdminPermission[];
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

  const { role, permissions: stored } = session.user;

  // Resolved rather than read straight off the session for the same reason
  // authOptions resolves it: accounts created through the staff screen have no
  // stored permissions array at all, and a role is the only thing that has ever
  // been written for them. Doing it here too means a session minted before this
  // change - a till that has been signed in for a week - is not locked out
  // until somebody signs out and back in.
  const permissions = resolvePermissions(role, stored);

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
  if (options.anyPerm?.length && !options.anyPerm.some((p) => permissions.includes(p))) {
    return NextResponse.json(
      { error: `Forbidden: requires one of "${options.anyPerm.join('", "')}".` },
      { status: 403 }
    );
  }

  if (options.license === "write") {
    const denied = await licenseWriteGate();
    if (denied) return denied;
  }
}
