// app/takeaway/page.tsx
//
// The takeaway counter, as its own screen.
//
// For the restaurant that puts one person on takeaway for a whole shift: they
// sign in, land here, and see their queue and nothing else. No floor plan, no
// delivery, no tab strip to get lost in. The same component backs /hub and
// /delivery - see features/pos/ManagementHub.tsx for why it is pinned rather
// than copied.

import ManagementHub from "@/features/pos/ManagementHub";
import RequirePermission from "@/components/auth/RequirePermission";

export default function TakeawayPage() {
  return (
    <RequirePermission permission="manage_takeaway">
      <ManagementHub workspace="takeaway" />
    </RequirePermission>
  );
}
