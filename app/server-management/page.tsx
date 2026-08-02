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

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="h-8 w-64 bg-neutral-800 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-neutral-900 rounded-lg p-4 h-20 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
