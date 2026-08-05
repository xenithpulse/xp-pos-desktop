// components/auth/RequirePermission.tsx
//
// Gate a page on a permission, in the browser.
//
// ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────────
// This is NAVIGATION, not security. It stops a delivery rider from wandering
// into the floor plan and stops the home screen offering tiles that lead to a
// wall - both of which are usability problems, not attacks. The actual
// enforcement is on the API routes, via isAdminRequest() in lib/auth.ts, and
// that is what must be correct: anyone can edit client state.
//
// Said plainly so nobody later mistakes this for the security boundary and
// stops adding the server-side check.
//
// ── WHY IT REDIRECTS RATHER THAN SHOWING A 403 ───────────────────────────────
// The person who lands somewhere they should not be is almost never probing -
// they followed a stale bookmark, or a shortcut somebody else set up on the
// till. Dropping them where they CAN work is more useful than telling them they
// are forbidden, so the fallback is their role's own landing page.

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  hasPermission,
  landingPathForRole,
  type AdminPermission,
} from "@/types/admin.types";

export default function RequirePermission({
  permission,
  children,
}: {
  permission: AdminPermission;
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const role = session?.user?.role;
  const granted = session?.user?.permissions;
  const allowed = status === "authenticated" && hasPermission(role, granted, permission);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (!allowed) {
      // Their own landing page, not "/" - a rider sent to the home screen would
      // just be looking at tiles they cannot open.
      const home = landingPathForRole(role);
      router.replace(home === window.location.pathname ? "/" : home);
    }
  }, [status, allowed, role, router]);

  if (status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-white">
        <p className="flex items-center gap-2 text-sm text-neutral-400">
          <Loader2 size={16} className="animate-spin" />
          Checking your access…
        </p>
      </div>
    );
  }

  if (!allowed) {
    // Shown for the frame between the check failing and the redirect landing.
    return (
      <div className="grid min-h-screen place-items-center bg-black px-6 text-white">
        <div className="max-w-sm text-center">
          <ShieldAlert size={28} className="mx-auto text-amber-400" />
          <p className="mt-3 font-semibold">This screen is not part of your job</p>
          <p className="mt-1 text-sm text-neutral-400">
            Taking you back to where you work. If you think you should have access to this,
            ask your manager to change your role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
