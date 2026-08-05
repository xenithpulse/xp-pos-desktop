// app/delivery/page.tsx
//
// The delivery desk, as its own screen.
//
// Same reasoning as /takeaway: a rider or a delivery coordinator works one
// queue all shift and should open the POS straight into it. The `delivery` role
// grants this permission and no other, so somebody on that role has exactly one
// screen. See types/admin.types.ts.

import ManagementHub from "@/features/pos/ManagementHub";
import RequirePermission from "@/components/auth/RequirePermission";

export default function DeliveryPage() {
  return (
    <RequirePermission permission="manage_delivery">
      <ManagementHub workspace="delivery" />
    </RequirePermission>
  );
}
