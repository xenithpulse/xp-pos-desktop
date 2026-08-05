# Phase 17 — Small screens

## The test this phase has to pass

A waiter is handed a phone at the start of service. They take dine-in orders on
it and they cover delivery. They never sit down, they never rotate the device to
find a control, and they never zoom.

Nothing they need is off the edge of the screen, under a floating button, or
four columns wide.

---

## The one rule that governs this phase

> **Large screens do not change.**

Not the layout, not the positions, not the sizes, not the spacing. If a diff
alters what a desktop or a full-size till renders, it is wrong — regardless of
how much better it looks.

In practice that means every change in this phase is one of:

- a **new** small-screen branch (`grid-cols-1 md:grid-cols-4`), leaving the
  existing value as the `md:`/`lg:` case;
- a **max-width guard** that only binds below the breakpoint (`w-full max-w-96`
  in place of a bare `w-96`);
- something that renders **only** below a breakpoint (`md:hidden`).

Anything that reads `md:` or larger keeps the number it has today. Where a class
currently has no prefix and applies everywhere, the fix is to add the prefixed
version with the *current* value and give the unprefixed one the new small-screen
value — never the other way round.

**Do not** introduce a new breakpoint. This project is Tailwind v4 with no
`@theme` screens block, so only the defaults exist: `sm` 640, `md` 768, `lg`
1024, `xl` 1280. Phase 16 found two labels hidden at every width because
somebody wrote `xs:inline` and there is no `xs`. If you need a device class in
TypeScript rather than CSS, `useDeviceClass()` already exists
([ResponsiveCanvasWrapper.tsx:31](pos_modules/floor-plan/ResponsiveCanvasWrapper.tsx#L31))
and uses phone < 768, tablet < 1024. Use it; do not invent a second one.

The viewport meta is already correct (Next emits
`width=device-width, initial-scale=1`). Leave it alone.

---

## Part 1 — The Dine-In top bar

This is the one that was reported, and it is the worst of them.

[GlobalContextBar.tsx:312](pos_modules/context-bar/GlobalContextBar.tsx#L312)
renders one row: tabs on the left, order context in the middle, global actions
on the right. Most of it is already responsive — the tab strip is `hidden md:flex`
and moves to a bottom bar
([:710](pos_modules/context-bar/GlobalContextBar.tsx#L710)), several badges are
`hidden sm:`/`hidden md:`.

The right-hand cluster is not. On a phone, with an order open, it still renders
**seven** controls, every one of them icon-only:

| Control | Line | Visible on a phone? |
|---|---|---|
| Print Kitchen Ticket | [:520](pos_modules/context-bar/GlobalContextBar.tsx#L520) | yes |
| Print Receipt | [:528](pos_modules/context-bar/GlobalContextBar.tsx#L528) | yes |
| Thermal printer status | [:539](pos_modules/context-bar/GlobalContextBar.tsx#L539) | yes |
| Printer settings | [:543](pos_modules/context-bar/GlobalContextBar.tsx#L543) | yes |
| Sync / activity | [:556](pos_modules/context-bar/GlobalContextBar.tsx#L556) | yes |
| Refresh | [:574](pos_modules/context-bar/GlobalContextBar.tsx#L574) | yes |
| User menu | [:592](pos_modules/context-bar/GlobalContextBar.tsx#L592) | yes |

Plus the centre section's order badges, which are in an `overflow-x-auto`
container — so on a narrow screen the table number, order number, status, total
and pending-items count are a horizontal scroll region that nothing indicates is
scrollable.

**Fix.** Below `md`, the bar carries only what a waiter uses mid-order:

- **Keep inline:** the order's identity and money — table/mode badge, order
  number, status, grand total, pending-cart count. These are why the bar exists.
  Give them `flex-wrap` instead of horizontal scroll so a second line appears
  rather than content hiding off-screen.
- **Collapse into one labelled "More" control:** printing, printer settings,
  sync/activity, refresh, user menu. One tap, one sheet, every item with a text
  label. This is the same pattern Phase 16 used for the order-history row
  (`RowActionsMenu` in
  [OrderList.tsx](pos_modules/orders/List_History/OrderList.tsx)) — reuse the
  shape, do not invent a second one.
- **Drop entirely below `md`:** the fullscreen toggle and the sidebar toggle.
  Neither means anything on a phone. The fullscreen toggle is already
  `hidden sm:flex`; make it `hidden md:flex` and take the sidebar toggle with it
  — but read Part 2 first, because that toggle is currently load-bearing.

Desktop keeps all seven exactly where they are.

### 1.1 The floating menu button lands on top of the bar

[Sidebar.tsx:471](components/layout/Sidebar.tsx#L471) puts the mobile menu
button at `fixed top-4 right-4 z-50`. The context bar header is `z-40`
([:312](pos_modules/context-bar/GlobalContextBar.tsx#L312)). So on every POS
screen below `lg`, a 48px button sits **on top of** the right-hand cluster —
over the user menu and refresh.

**Fix.** The floating button is for pages that have no chrome of their own. On
the POS workspaces the bar is the chrome, so the menu belongs *in* it. Either
give the button a page-aware offset, or — better — let the context bar own the
nav trigger below `md` and have the sidebar skip its floating button when a host
supplies one. Decide and write it down; do not leave two triggers.

> **DECIDED (Phase 17): the context bar owns the nav trigger, and the sidebar
> stands down when a host claims it.**
>
> Three pieces, all in place:
>
> 1. The drawer's open state moved out of `MobileSidebar`'s local `useState`
>    into the store (`mobileNavOpen` in [posStore.ts](stores/posStore.ts)), so
>    something other than the floating button can open it.
> 2. `GlobalContextBar` claims the trigger with `useNavTriggerHost()` — a
>    layout-effect registration, so the claim lands before paint and the
>    sidebar's button never flashes on a POS screen. It is a counter, not a
>    boolean, so two bars mounting during a route transition cannot leave the
>    flag stuck.
> 3. `MobileSidebar` renders its floating button only when the counter is zero.
>    The drawer itself is unconditional — it is the nav, and whoever opened it.
>
> The claim is **below `lg`**, not below `md` as the paragraph above suggests.
> The collision is with the sidebar's own button, which is `lg:hidden`, and
> `Sidebar` switches to the drawer at 1024. Claiming only below `md` would have
> left the two triggers overlapping across the whole 768–1024 band — the tablet
> case, which is most of the reported hardware.

---

## Part 2 — Navigation has to work, and has to be shorter

### 2.1 The sidebar can be dismissed with no way back

[layout.tsx:213](app/layout.tsx#L213) hides the sidebar entirely when
`isHubPage && !sidebarVisible`. The only control that sets `sidebarVisible` is
the context bar's toggle at
[GlobalContextBar.tsx:498](pos_modules/context-bar/GlobalContextBar.tsx#L498),
which is `hidden md:flex`.

So: hide the sidebar at 900px, drop below 768px, and there is no navigation and
no way to bring it back. It survives a reload only because `sidebarVisible`
resets to `true` — `persist` is imported in
[posStore.ts:5](stores/posStore.ts#L5) but never applied, so the flag is
in-memory. That is luck, not design.

**Fix.** `sidebarVisible` is a desktop preference. Below `md` it must be ignored
outright — the mobile nav is a drawer, and a drawer that is closed is not the
same thing as a nav that does not exist.

> **BUILT AT `lg`, NOT `md`.** `DesktopSidebar` is itself `hidden lg:flex`, and
> `Sidebar` swaps to `MobileSidebar` under 1024. So between 768 and 1024 this
> flag was never collapsing a rail — there is no rail there — it was deleting
> the mobile drawer. Ignoring it only below `md` would have left that intact at
> exactly the widths most of the hardware runs at, and §1.1's new trigger would
> then open a drawer that is not in the tree.
>
> Both halves moved together: `useSidebarHidden()` in
> [layout.tsx](app/layout.tsx) gates on `lg`, and the toggle that sets the flag
> went `hidden md:flex` → `hidden lg:flex`. The control and the thing it
> controls now exist over the same range. Nothing at 1024 and above changes.

### 2.2 The mobile nav offers modules that do not work on a phone

`NAV_ITEMS` ([Sidebar.tsx:65](components/layout/Sidebar.tsx#L65)) is filtered by
permission only. A waiter (`manage_orders` only) is therefore offered **Dine-In**
and **Server** — the second because the server screen is deliberately ungated
([app/server-management/page.tsx](app/server-management/page.tsx)). A recovery
console is not a waiter's screen and certainly not a phone screen.

**Fix.** Add a `mobile: true` flag to `NavItem` and, below `lg`, show only the
flagged entries. The supported set for this phase:

> **BUILT AT `md`, NOT `lg`.** This paragraph and the Out-of-scope list
> disagree, and Out-of-scope wins. It keeps Takeaway, Kitchen, Daily Sheet,
> Analytics, Inventory, Admin, Peers and Server as "desktop/**tablet** screens
> this phase" — but the drawer is the nav for everything below `lg`, so
> filtering it at `lg` would have taken Admin away from a manager on a 900px
> tablet. That is not a small-screen fix, it is a new hole at the width most of
> the hardware runs at.
>
> The filter is therefore below `md`, which is where `useDeviceClass()` already
> draws the phone line — no second definition invented. Phone: Dine-In and
> Delivery. Tablet: the full permitted set, exactly as today.

- **Dine-In** (`/dine-in`)
- **Delivery** (`/delivery`)

Everything else — Takeaway, Kitchen, Daily Sheet, Analytics, Inventory, Admin,
Peers, Server — is desktop/tablet only and is not listed on a phone. They are not
*blocked*: a pasted URL still resolves and the permission guards still apply.
They are simply not offered, because offering a door that leads to an unusable
screen is worse than not offering it.

> **Decide and record.** A `waiter` holds `manage_orders` and nothing else
> ([admin.types.ts:110](types/admin.types.ts#L110)), so *Delivery* will not
> appear for them — it needs `manage_delivery`. Either the waiter role gains
> `manage_delivery`, or the people who cover delivery are given the `delivery`
> role, or the mobile set is Dine-In only. This is a policy question, not a
> layout one. Pick one and write the answer into this file before building.
>
> **DECIDED (Phase 17): the `waiter` role gains `manage_delivery`.**
> One waiter on one phone covers both the floor and the door, which is the
> shift this phase is built for, so both entries appear for them.
>
> This is a permission change, not a nav change, and it is wider than the nav:
> `manage_delivery` also opens every API route and page guarded on it —
> `/delivery` itself, the delivery order endpoints, the rider assignment
> actions. A waiter account can now do delivery work, not merely see the link.
> That is the intended reading of the decision.
>
> **The consequence, stated plainly.** `resolvePermissions()`
> ([admin.types.ts:199](types/admin.types.ts#L199)) returns the *union* of the
> account's stored array and its role's grants, so a permission cannot be
> revoked from one person below what their role gives. There is therefore no
> longer any role that manages dine-in orders without also managing delivery:
> `waiter` and `cashier` both carry both, and `delivery` carries delivery
> alone. A site that needs a floor-only account has no role to put them in.
>
> If that turns out to matter, the fix is a new narrow role (`floor`, holding
> `manage_orders` only) — not a per-account edit, which the union will ignore.
> Left undone deliberately: no site has asked for it, and inventing a role
> nobody requested is how a permission model becomes unreadable.

### 2.3 The pinned workspaces have a one-tab bottom bar

On `/takeaway` and `/delivery`, `hiddenTabs` reduces `visibleTabs` to a single
entry ([ManagementHub.tsx:176](features/pos/ManagementHub.tsx#L176)), so the
mobile bottom bar
([GlobalContextBar.tsx:710](pos_modules/context-bar/GlobalContextBar.tsx#L710))
renders one button that navigates nowhere — and `main` still reserves 56px for it
(`pb-14`, [ManagementHub.tsx:1662](features/pos/ManagementHub.tsx#L1662)).

**Fix.** Hide the bottom bar when there is one tab or fewer, and drop the `pb-14`
with it. On those routes the Queue/History switch in the workspace header is the
real navigation.

### 2.4 The pinned workspace header is too full for a phone

[ManagementHub.tsx:1591](features/pos/ManagementHub.tsx#L1591) puts an icon, a
title, a one-line blurb, the Queue/History switch and a "Dine-In" link on one
row. Below `sm` the blurb should go and the switch should take the full width on
its own line. Desktop unchanged.

---

## Part 3 — Things that are the wrong shape below `md`

Small, mechanical, and each one is a real failure today.

### 3.1 The kitchen board is four columns at every width

[OrderManagerGrid.tsx:139](pos_modules/orders/KDS/OrderManagerGrid.tsx#L139) is
`grid grid-cols-4` with no prefix. On a phone that is four ~80px columns; on a
tablet in portrait it is four ~180px columns. Tickets are unreadable.

**Fix.** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. The `lg` case is today's
layout, so large screens are untouched. Below that the columns stack and the
board scrolls vertically, which is how a phone reads a queue anyway.

Keep the column headings visible when stacked — a column of tickets with no
"Preparing" above it is just a list.

### 3.2 The table session panel is wider than a phone

[TableSessionPanel.tsx:186](pos_modules/floor-plan/TableSessionPanel.tsx#L186)
is `fixed right-0 … w-96` — 384px, with no max. On a 360px viewport the panel is
wider than the screen and its left edge is cut off.

**Fix.** `w-full max-w-96`. Identical at every width above 384px, so desktop does
not move.

For comparison,
[OrderDetailsPanel.tsx:278](pos_modules/orders/OrderDetailsPanel.tsx#L278)
already does this correctly (`w-full max-w-lg`). Match it.

### 3.3 Fixed grids inside panels

Same class of bug, lower stakes, fix as each is touched:

- [PaymentDrawer.tsx:198](pos_modules/orders/order-editor/PaymentDrawer.tsx#L198)
  — `grid-cols-4` of payment methods. With four tenant methods on a 360px screen
  each tile is ~78px, and a custom method name truncates to nothing. Wants
  `grid-cols-2 sm:grid-cols-4`.
- [OrderFooter.tsx:468](pos_modules/orders/order-editor/OrderFooter.tsx#L468) —
  `grid-cols-3`.
- [MobileTableGrid.tsx:369](pos_modules/floor-plan/MobileTableGrid.tsx#L369) —
  `grid-cols-3`. This one is *already* the mobile component, so check it on a
  real 360px screen before changing anything; it may be correct as-is.
- [ZoneTabBar.tsx:168](pos_modules/floor-plan/ZoneTabBar.tsx#L168),
  [ReservationControls.tsx:669](pos_modules/floor-plan/ReservationControls.tsx#L669),
  [TakeawayOrderSwitcher.tsx:166](pos_modules/orders/order-editor/TakeawayOrderSwitcher.tsx#L166).

> **What §3.3 actually changed, and what it deliberately did not.**
>
> Changed to `grid-cols-2 sm:grid-cols-N`: `PaymentDrawer` (was 4),
> `OrderFooter` (3), `ReservationControls` (3 — it renders inside the session
> panel, which is full-width on a phone after §3.2), `TakeawayOrderSwitcher`
> (3 — its tiles carry a customer name, truncated at 12 characters, and three
> across left nothing to tell two orders apart by).
>
> **Left alone, on purpose:**
>
> - `MobileTableGrid.tsx:369` — checked at 360px as the doc asks. `px-4` and two
>   8px gaps leave ~104px per card, which comfortably fits a table number and a
>   seat count. This is the deliberate high-density mobile view and three across
>   is what makes it high-density. Changing it would be a regression.
> - `ZoneTabBar.tsx:168` — the floor-texture picker. It sits in a dropdown with
>   `min-w-[200px]`, so its three swatches are ~60px at *every* width; a phone
>   makes it no worse. It is also floor-plan **editing**, which this phase puts
>   out of scope alongside `GlobalInspector` and `PlaygroundSidebar`.

`GlobalInspector` and `PlaygroundSidebar` are floor-plan **editing** tools. Those
are desktop work. Leave them.

---

## Part 4 — What is already right

Do not "fix" these. They were built responsive and they work:

- The order editor's cart/menu toggle below `md`
  ([OrderEditor.tsx:172](pos_modules/orders/order-editor/OrderEditor.tsx#L172)).
- Order history's table → cards swap at `md`
  ([OrderList.tsx](pos_modules/orders/List_History/OrderList.tsx)).
- The floor plan's canvas → `MobileTableGrid` swap via `useDeviceClass()`.
- The mobile bottom tab bar, including its `env(safe-area-inset-bottom)` padding.
- The KDS tray added in Phase 16 (`inset-2 sm:inset-6 lg:inset-10`).
- The viewport meta.

---

## Build order

1. **Part 2** — navigation. Nothing else matters if a waiter cannot get between
   two screens, and 2.2 needs a decision before anyone writes code.
2. **1.1** — the floating button collision. One line, and it is in front of
   every other fix.
3. **Part 1** — the top bar. The largest piece; do it once the nav trigger's
   home is settled.
4. **3.1 / 3.2** — the kitchen board and the session panel. Independent, small,
   visibly broken today.
5. **3.3** — the remaining grids, as each screen is opened.

---

## How to test it

Chrome DevTools is not sufficient on its own — it will not show you a thumb.
Use a real device for step 6.

1. **360 × 640** (small phone), `/dine-in`, with an order open. Nothing is
   clipped, nothing needs a horizontal scroll, and the menu button does not sit
   on another control.
2. Same screen: every control in the top bar is either labelled or inside the
   labelled "More" sheet.
3. **768 × 1024** (tablet portrait), `/kitchen`. Tickets are readable and the
   column headings are visible.
4. **1280 × 800 and up:** open every screen this phase touched and compare
   against `main` side by side. **Anything that moved is a bug.** This is the
   check that keeps the phase honest — do it before the review, not after.
5. Sign in as a waiter on a phone. The nav lists the agreed mobile set and
   nothing else. `/server-management` is not offered.
6. **Hand the phone to somebody and ask them to take a dine-in order for table 4
   and send it to the kitchen.** Watch their thumb, not the screen. Every control
   they have to reach for twice is a bug in this phase.

---

## Out of scope

- Any change to what a large screen renders. See the rule at the top.
- Making Takeaway, Kitchen, Daily Sheet, Analytics, Inventory, Admin, Peers or
  Server usable on a phone. They stay desktop/tablet screens this phase.
- A new breakpoint, a CSS framework change, or a component library.
- The first-sign-in walkthrough. Still deferred — same reason as Phase 16: the
  screens it would describe are still moving, and this phase moves them again.
- The Security block on Server Management → System Health (`requireHttps`,
  `enableRateLimiting`, `rateLimitPerMinute`, `enableAuditLog`), which still
  displays four settings that nothing enforces. Flagged in Phase 15 and Phase 16,
  unchanged.
