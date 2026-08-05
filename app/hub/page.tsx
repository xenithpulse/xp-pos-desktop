// app/hub/page.tsx
//
// The full POS floor: every tab the site's settings enable. The component that
// backs it also backs /takeaway and /delivery in pinned form - see
// features/pos/ManagementHub.tsx.

import ManagementHub from "@/features/pos/ManagementHub";
import RequirePermission from "@/components/auth/RequirePermission";

export default function HubPage() {
  return (
    <RequirePermission permission="manage_orders">
      <ManagementHub />
    </RequirePermission>
  );
}
