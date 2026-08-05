// app/server-management/page.tsx

import { Suspense } from "react";
import ServerManagementPage from "@/features/server-management/ServerManagementPage";

// Intentionally PUBLIC — no sign-in required.
// This is the recovery/handover surface: if auth ever breaks (e.g. a network
// change) the client must still be able to reach server settings without being
// able to log in first. Access is limited by being on the LAN.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ServerManagementPage />
    </Suspense>
  );
}

// Mirrors the sidebar layout the real page renders, so the Suspense fallback
// does not shift everything sideways the moment it resolves.
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto flex max-w-[1400px]">
        <div className="hidden w-72 shrink-0 border-r border-neutral-800 p-4 lg:block">
          <div className="mb-6 h-10 animate-pulse rounded bg-neutral-900" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="mb-2 h-12 animate-pulse rounded-lg bg-neutral-900" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <div className="mb-6 h-9 w-64 animate-pulse rounded bg-neutral-900" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-900" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
