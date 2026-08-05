// app/dine-in/page.tsx
//
// The dine-in floor: tables, the orders board, the order editor and history.
//
// This used to be /hub, and "hub" was doing two jobs. Takeaway and Delivery got
// their own pages in Phase 15, so keeping them as tabs here meant two routes to
// the same screen and a tab strip that contradicted the sidebar. Phase 16 §3
// makes the four workspaces read the same way — Dine-In · Takeaway · Delivery ·
// Kitchen — and this is the first of them.
//
// /hub still resolves: it redirects here. Desktop shortcuts, printed cards and
// bookmarks on staff tablets all point at the old path, and breaking them turns
// a rename into a support call.
//
// The same component backs /takeaway and /delivery in pinned form — see
// features/pos/ManagementHub.tsx.

import ManagementHub from "@/features/pos/ManagementHub";
import RequirePermission from "@/components/auth/RequirePermission";

export default function DineInPage() {
  return (
    <RequirePermission permission="manage_orders">
      <ManagementHub />
    </RequirePermission>
  );
}
