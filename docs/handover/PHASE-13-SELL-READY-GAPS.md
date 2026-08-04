# Phase 13 — Closing the sell-ready gaps

**Status:** engineering done — `npx tsc --noEmit` and `next build` both clean.
`.\installer\build.ps1` (the full installer package + its 42 assertions) has
not been run since this landed; run it before shipping. On-box walkthrough
(creating a real delivery order, testing `/kitchen` on a second device, and a
live WhatsApp send against a real number) still needs to happen — see "Watch
out for" at the bottom, which also has a role-permission gap found while
building the kitchen screen.
**Depends on:** Phase 12 (branding, first-run, sample data) — done, and is what made a
persona audit possible at all: before it, there was no first-run path to even
reach these screens as a new user would.
**Risk:** low-medium. Mostly additive, on top of a data model that already
anticipated most of it — see "What already exists" under each item. The
exception is the kitchen-screen auth question, which is a real design decision,
not a formality.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Why this phase exists

The direction for this phase was: **sell to single restaurant owners, ASAP.**
Not "make it more capable" in the abstract — find what actually costs a sale or
a returning customer in the first week, and fix that first. Region-specific
hardening (tax law, e-invoicing, GCC currency edge cases) is Phase 14. This
phase is about gaps that would frustrate *any* single-restaurant buyer,
anywhere.

### Method: three personas, walked through the real code

Not a brainstorm — each finding below is a specific file, checked, not assumed.

- **Restaurant owner, first week.** Nav is genuinely clean:
  POS Floor / Daily Sheet / Analytics / Inventory / Admin / Peers / Server
  (`components/layout/Sidebar.tsx:50-56`). Staff management already has payment
  history (`features/PeerManagement/StaffPaymentHistoryDrawer.tsx`), which is
  more depth than a v1 usually has. The gap that stood out: **no way to take a
  delivery order**, for a segment of restaurants where delivery is not optional
  — a lot of South Asian and Middle Eastern restaurants do more delivery volume
  than dine-in.
- **Cashier taking an order.** Dine-in works by seating a table
  (`pos_modules/floor-plan`). Takeaway has its own dedicated creation route
  (`app/api/pos/takeaway/route.ts`) with its own mode constant. **Delivery has
  neither** — see below.
- **Kitchen staff working from tickets.** A ticket board already exists
  (`pos_modules/orders/KDS/OrderManagerGrid.tsx` — columns by status: New,
  Preparing, Ready, etc.), and `OrderCard.tsx` is already delivery-aware (a
  truck icon, customer info shown conditionally for delivery mode, different
  "ready" semantics for delivery vs. dine-in). But it lives as one tab inside
  the general `/hub` workspace, not as something you can hand a kitchen its own
  screen for.

---

## 1. The delivery module — the centerpiece of this phase

### What already exists (do not rebuild this)

Checked directly, not assumed:

- `OrderMode` already includes `'delivery'` as a first-class value, with its
  own status flow: `draft → confirmed → preparing → ready → out_for_delivery →
  completed` (`types/order.types.ts:14-24, 95-98`).
- The order schema already has a `deliveryFee` field (`df?: number`,
  `models/schemas/order.schema.ts:271`).
- The kitchen ticket board (`OrderCard.tsx`) already renders delivery orders
  correctly *if one exists* — truck icon, customer info, delivery-specific
  "ready" handling.
- Receipt printing already labels the order type correctly, including
  `'delivery': 'Delivery'` (`pos_modules/orders/order-editor/useOrderEditorState.ts:1215`).

So the data model, the kitchen board, and the receipt all already know what a
delivery order is. **What's missing is the front door**: there is no route, no
button, and no form anywhere that lets a cashier actually create one. Dine-in
gets one by seating a table. Takeaway gets one from its own dedicated route.
Delivery gets nothing — confirmed by grepping `app/hub/page.tsx` for the string
`delivery`: zero matches.

### What to build

A creation flow parallel to takeaway's existing pattern:

- A dedicated route, e.g. `app/api/pos/delivery/route.ts`, mirroring
  `app/api/pos/takeaway/route.ts`'s shape (create a draft order linked to a
  customer, mode = delivery).
- A capture form: customer name, phone, delivery address (free text — no
  geocoding needed for v1), delivery fee (the field already exists, just needs
  a UI), and an optional note.
- A "New Delivery" entry point in the `/hub` tab list, next to Takeaway.
- Status progression reuses what already exists —
  `preparing → ready → out_for_delivery → completed` is already defined, the
  new work is just exposing "mark out for delivery" and "mark delivered" as
  actions on the order card, the same way takeaway's "mark ready" already
  works.

### What NOT to build — scope this deliberately

**No rider dispatch, no GPS tracking, no route optimization.** That is a
distinct product (Uber Eats/DoorDash-style logistics), not a POS feature, and
building it would blow the "ASAP" part of this phase's own goal. A single
optional free-text field — "assigned to" or "rider name" — is enough for a
single-restaurant owner who has one or two of their own delivery staff. If a
future customer needs real dispatch, that is aggregator integration (Talabat,
Careem, Foodpanda, Swiggy, Zomato, UberEats) — a different, larger phase, not
this one.

---

## 2. A standalone kitchen screen

### What already exists

`OrderManagerGrid` is a genuinely good status-column ticket board. The gap is
that it only exists as a tab inside `/hub`, alongside floor plan, order editor,
and settings-adjacent things a kitchen has no business touching.

### What to build

A dedicated route — something like `/kitchen` — that renders just the ticket
board, full-screen, filtered by `kitchenStation` (a field that already exists
on every menu item and is currently unused for filtering anything). A kitchen
mounts one screen, on one station's tickets, and never needs to navigate
anywhere else.

### The real design decision, not a formality: how does a kitchen screen authenticate?

A full login on a device sitting in a kitchen, wiped down and touched with
sauce-covered hands between orders, is real friction. But "no auth at all" on
a route that can mark orders complete is also a real decision, not a default to
fall into. Options worth weighing, not a recommendation to build blindly:

- A lightweight per-device PIN, separate from the full admin login.
- A long-lived, revocable device token issued once from the admin panel
  (similar in spirit to how a printer or a display gets paired once).
- Accept the friction and require the same login as everywhere else, at least
  for v1, and revisit if it turns out to actually bother customers.

This should be a deliberate choice, made once you've seen how it feels on a
real kitchen tablet — not something to lock in during a doc-writing pass.

---

## 3. Wire up WhatsApp — small, and already half-paid-for

`lib/whatsapp.ts` is a complete, working sender against Meta's WhatsApp Cloud
API. It is called from **nowhere in the codebase** — confirmed by grepping for
`sendWhatsAppMessage` across the whole repo: one match, its own definition.

### What to build

Call it from one real trigger point — order confirmed, or order completed is
the obvious first choice — to send an order confirmation or a digital receipt
link. This is genuinely close to the default expectation for order
confirmations in Pakistan, India and the UAE, and it's sitting there unused.

### One thing to verify before wiring it in, not assume

`lib/whatsapp.ts` currently sends a **free-form text message**
(`type: "text"`). WhatsApp's Cloud API distinguishes between messages sent
*within* a 24-hour window after the customer messaged the business first (free
text is fine) and messages the *business* initiates first (which require a
pre-approved message **template**, not free text). A restaurant confirming a
phone-in or walk-in order over WhatsApp is very likely the second case. Verify
this against Meta's current Business API policy before relying on it — my
knowledge of the exact current rules may be stale, and getting this wrong means
messages silently fail to send rather than erroring somewhere visible.

---

## Acceptance criteria

- [x] A delivery order can be created, ticketed, marked out-for-delivery, and
      completed, end to end, without touching the database by hand —
      `app/api/pos/delivery/route.ts` (new), wired into `/hub`'s tab list the
      same way takeaway is. Status transitions and the kitchen board already
      worked before this phase; only the creation flow was missing.
- [x] A standalone kitchen screen route exists, filterable by kitchen station
      — `app/kitchen/page.tsx` (new), station filter built from a client-side
      `itemId → kitchenStation` join against `/api/menu/items` rather than a
      schema change (order items don't carry their own station). Auth: same
      session login as every other page, per the "accept the friction for v1"
      option — no new PIN/token scheme built.
- [x] WhatsApp sends on a real trigger point (not just that the function is
      called) — `app/api/pos/fire-order/route.ts`, the moment a draft order's
      first items are fired to the kitchen (the actual draft→confirmed
      transition; `PATCH action: 'confirm'` was dead code, never surfaced as a
      button). Free-text only, gated on `isWhatsAppConfigured()`
      (`lib/whatsapp.ts`) so it no-ops cleanly where WhatsApp isn't set up.
      **Not yet tested against a real WhatsApp Business number** — do that
      before calling this done.
- [x] `npx tsc --noEmit` clean, `next build` clean. **`installer\build.ps1`
      not yet run** — do that before shipping.

## Watch out for

- Do not let "delivery module" grow into a dispatch/logistics product. One
  free-text rider field is the v1 bar. Built as `riderName` — a plain optional
  string end to end (schema `rn`, compression map, `Order.riderName`, editable
  via `DeliveryDetailsBar` in the order editor and `PUT /api/orders/:id`).
- Verify the WhatsApp template-message requirement against Meta's *current*
  policy, not this document — API terms change. The 24h-window / template
  limitation is documented in `.env.example` and as a code comment at the
  send call site, not just here.
- The kitchen-screen auth "accept the friction" option was chosen for v1 —
  same login as everywhere else, `/kitchen` is unrestricted in
  `app/layout.tsx`'s `ROUTE_ACCESS_CONFIG` (reachable by any authenticated
  role, not just manager/super_admin like `/hub` is).
- **Found while building this, not part of the original scope, and left
  unfixed — a real gap worth a deliberate decision:** `ROLE_PERMISSIONS` in
  `types/admin.types.ts` gives the `chef` role `manage_menu` +
  `manage_inventory`, but **not** `manage_orders`. Every order-mutating API
  (`PATCH /api/orders/:id`, the kitchen screen's status-change calls) requires
  `manage_orders`. As shipped, a staff account with the `chef` role can open
  `/kitchen` and see tickets but gets a 401 trying to mark anything ready —
  only `super_admin`, `manager`, `cashier`, or `waiter` accounts can actually
  work a kitchen screen today. Either give `chef` the `manage_orders`
  permission or decide kitchen accounts should be provisioned under a
  different role — don't leave this undecided once real hardware is involved.
