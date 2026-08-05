# Phase 16 — Stranger-ready

## The test this phase has to pass

Someone who has never seen this POS, and who was not trained on it, is put in
front of a till during service. They have to get an order out without asking
anyone.

Everything below is either a bug that fails that test, or an interface that
fails it. They are in one phase because they are one problem.

---

## Part 0 — Rules that apply to every screen

These are not suggestions for this phase; they are the standard the rest of the
UI gets brought up to as it is touched.

### 0.1 Labels with icons. Never an icon alone.

An icon-only button is a quiz. A trash can is guessable; a truck, a play
triangle and two overlapping rectangles are not, and the person guessing is
holding a customer's order.

Every action control carries a **text label**. The icon sits beside it as a
recognition aid, not as the message. Where horizontal space genuinely will not
allow it, the label goes underneath at a smaller size — it does not get dropped.

`title=` attributes do not count. They do not exist on a touchscreen, which is
what these tills are.

### 0.2 Nothing important is revealed by hovering.

Hover does not exist on a tablet. Any control that only appears on `:hover` is
invisible to roughly half the devices this runs on, and undiscoverable on the
rest.

Known offenders, both in the order history:
[OrderList.tsx:897](pos_modules/orders/List_History/OrderList.tsx#L897) and
[OrderList.tsx:972](pos_modules/orders/List_History/OrderList.tsx#L972), both
`opacity-0 group-hover:opacity-100`.

Row actions become permanently visible. If that is too heavy at the row level,
the fallback is a single always-visible **Actions** control per row that opens a
menu — not a hidden cluster that materialises under the cursor.

### 0.3 Plain English.

Write what the person would say out loud. Short words, no product vocabulary, no
internal state names leaking into labels.

| Instead of | Write |
|---|---|
| Fire Order | Send to Kitchen |
| KOT | Kitchen Ticket |
| Initiate Session | Seat Guests |
| Mark Ready | Ready |
| Out for Delivery | Out for Delivery *(already plain — keep)* |
| Complete | Close Order |
| Amount Due | Left to Pay |
| Covers | Guests |
| Adjustment | Discount or Charge |

The table is a starting point, not the whole job. The rule is: if a waiter would
not use the word to another waiter, it does not go on a button.

### 0.4 Say what a control will do, not what it is.

`Cancel` next to an order does not mean "close this panel", it means "cancel this
customer's order" — and those two readings have very different consequences.
Destructive and state-changing controls are named with their object:
**Cancel Order**, **Delete Payment**, **Remove Item**.

---

## Part 1 — Kitchen Display (KDS)

### 1.1 An order set to Ready vanishes, and "Served / Out" is never populated

**This is the highest-priority bug in the phase.** It loses orders off the
screen mid-service.

**Root cause, confirmed.**
[OrderCard.tsx:88–100](pos_modules/orders/KDS/OrderCard.tsx#L88-L100) maps each
status to its next action. From `ready`:

```ts
ready: mode === 'delivery'
  ? { action: 'out_for_delivery', label: 'Out for Delivery', … }
  : { action: 'complete',         label: 'Complete',         … }   // ← the bug
```

For dine-in and takeaway, the only action offered from **Ready** is `complete`,
which jumps the order straight to `completed`. `completed` is excluded by
`activeOnly=true`
([orders/route.ts:82–86](app/api/orders/route.ts#L82-L86)) and by the kitchen
screen's own local filter, so the card disappears.

The **Served / Out** column
([OrderManagerGrid.tsx:41–69](pos_modules/orders/KDS/OrderManagerGrid.tsx#L41-L69))
matches `['served', 'out_for_delivery']`. Nothing in the KDS ever sets `served`.
The column is therefore unreachable for every dine-in order — exactly as
reported.

**The API is not the problem.** `mark_served` already exists and works
([orders/[id]/route.ts:323](app/api/orders/[id]/route.ts#L323)). Only the client
never calls it.

**Fix.** Make the ladder complete, per order type:

| Status | Dine-in | Takeaway | Delivery |
|---|---|---|---|
| `ready` | **Served** → `mark_served` | **Collected** → `mark_served` | **Out for Delivery** → `out_for_delivery` |
| `served` | **Close Order** → `complete` | **Close Order** → `complete` | — |
| `out_for_delivery` | — | — | **Delivered** → `complete` |

`served` and `out_for_delivery` already map to `complete`, so those rows need no
change. The single-line change is `ready` for the non-delivery case.

**Decide and record:** whether closing an order should be possible from the KDS
at all, or whether the KDS should stop at Served/Out and let the till close and
take payment. Recommendation: **the KDS stops at Served/Out.** A kitchen closing
an unpaid order is how money goes missing. If that recommendation is accepted,
the `served` and `out_for_delivery` rows lose their action in the KDS and keep
it in the hub.

> **DECIDED (implemented): the KDS stops at Served / Out.**
> `served` and `out_for_delivery` offer no action on the kitchen board and keep
> **Close Order** / **Delivered** in the hub. The whole ladder now lives in one
> place — [statusLadder.ts](pos_modules/orders/statusLadder.ts) — parameterised
> by `surface: 'kds' | 'hub'`, so the board, the hub list and the details panel
> cannot drift apart again. Three screens each had their own copy before, and
> they disagreed.
>
> Backed on the server as well: `add_payment`, `remove_payment`, `set_credit`
> and `complete_and_pay` are re-checked against the narrower
> `ORDER_WORKSPACE_PERMS` inside `PATCH`. `PATCH` is deliberately open to
> `view_kitchen` so a chef can advance a ticket; money is not part of that.

### 1.2 No side tray when advancing a status

Clicking anywhere on a card calls `onViewDetails`
([OrderCard.tsx:153](pos_modules/orders/KDS/OrderCard.tsx#L153),
[OrderManagerGrid.tsx:103–109](pos_modules/orders/KDS/OrderManagerGrid.tsx#L103-L109)),
which opens the details panel everywhere except the standalone kitchen screen,
where it is wired to a no-op.

On a kitchen screen a panel sliding out is pure obstruction: it covers other
tickets, and it is not what the person tapping wanted.

**Fix.** Introduce an explicit KDS mode on the grid:

- The **card body is not a button**. Tapping it does nothing.
- Status advance happens on the labelled action button only, which is already
  there ([OrderCard.tsx:279–298](pos_modules/orders/KDS/OrderCard.tsx#L279-L298)).
- Order details, if wanted, get their **own labelled control** on the card
  (`Details`), not the whole surface.
- Remove the `preparing`-only quick-advance special case in `handleCardClick`.
  One rule for every column beats a rule that changes per column.

The hub's Orders grid may keep the details panel — it is a management view, and
that is what it is for. This is a difference in mode, so it must be a prop, not
a guess based on which page is rendering.

### 1.3 The details panel actions are also the status indicator

The panel currently doubles as the status display and the action list, and its
destructive control is labelled `Cancel`
([OrderDetailsPanel.tsx:664–666](pos_modules/orders/OrderDetailsPanel.tsx#L664-L666)).

**Fix.**
- Rename to **Cancel Order** (rule 0.4).
- Give it a confirmation step. It is the only irreversible action on the panel
  and it currently fires on one tap.
- Separate the two jobs visually: a **status strip** at the top that shows where
  the order is, and an **actions** block at the bottom. Right now the reader has
  to infer the current status from which buttons are present.

---

## Part 2 — Taking an order

### 2.1 Items can be added with no table and no customer

Currently the catalogue is live before an order has anywhere to go, so it is
possible to build a cart that belongs to nobody and discover the problem at the
end.

**Fix.** The catalogue is **disabled until the order has an owner** — a table
for dine-in, a customer for takeaway and delivery.

Disabled, not hidden: a greyed catalogue with one line across it explaining what
is missing teaches the sequence. A missing catalogue just looks broken.

The message says what to do, not what is wrong:
> **Choose a table first.** Pick a table from the floor plan and the menu will open.

The primary control to fix it goes in that message.

### 2.2 Split the bill across payment methods

**The data model already supports this.** Payments are an array — `order.tx` —
and `add_payment` pushes onto it
([orders/[id]/route.ts:557–570](app/api/orders/[id]/route.ts#L557-L570)),
carrying method, custom method label, amount, reference and who took it. There
is a `split` payment status in the type already
([order.types.ts](types/order.types.ts)).

What is missing is the interface. The payment drawer
([PaymentDrawer.tsx](pos_modules/orders/order-editor/PaymentDrawer.tsx)) treats
payment as one method for one amount, with a "half" shortcut
([PaymentDrawer.tsx:142](pos_modules/orders/order-editor/PaymentDrawer.tsx#L142)).

**Build.**
- A **list of payments already taken** on this order, each showing method,
  amount, and a labelled **Remove** control. Nobody can currently see what has
  been paid without leaving the screen.
- **Left to Pay** as the running figure, updating as payments are added.
- Add-payment defaults its amount to the full remaining balance, so the common
  case is one tap.
- Quick splits: **Half**, **Split evenly by N**, and free entry.
- Each payment records its own method, so "£20 cash, rest on card" is two
  entries rather than a note.

### 2.3 No taking payment when nothing is owed

With **Left to Pay** at zero, the add-payment control is **disabled**, with the
reason stated: *"This order is fully paid."*

Overpayment is not a rounding annoyance — it is a real cash-drawer discrepancy at
close, and the person who caused it has gone home.

If genuine overpayment must be supported for tipping, it is a separate, clearly
labelled **Add Tip** action, never a silent extra payment.

### 2.4 Invoices must show the split

The receipt layout currently renders a single payment: one `paymentMethod`, one
`amountPaid`, one `change`
([receiptLayout.ts:331–337](pos_modules/orders/printing-facility/receiptLayout.ts#L331-L337)).
An order paid across two methods prints as though it were paid by one, which is
wrong on a document a customer keeps and an accountant reads.

**Fix.** Render one line per payment:

```
Paid
  Cash                    20.00
  Card ····4417           13.50
  ─────────────────────────────
  Total Paid              33.50
  Change                   0.00
```

Notes for whoever builds it:
- `receiptLayout.ts` warns at
  [line 8](pos_modules/orders/printing-facility/receiptLayout.ts#L8) that its
  layouts are mirrored elsewhere. **Find the mirror and change both**, or the
  thermal print and the preview will disagree.
- Single-payment orders must print **exactly as they do today**. This is the
  most-printed artefact in the product; a layout regression here is visible to
  every customer.
- Use the stored `methodLabel` (`mn`), not the coarse category, so a tenant's own
  method names survive onto the receipt.

---

## Part 3 — Hub becomes Dine-In

Takeaway and Delivery now have their own pages (Phase 15). Leaving them in the
hub as well means two routes to the same screen and a tab strip that contradicts
the sidebar.

**Changes.**
1. Remove the `takeaway` and `delivery` tabs from the context bar
   ([GlobalContextBar.tsx:80–89](pos_modules/context-bar/GlobalContextBar.tsx#L80-L89)).
2. Remove the corresponding render branches and their fetch/handler machinery
   from [ManagementHub.tsx](features/pos/ManagementHub.tsx) **only where they are
   not shared with the pinned workspaces** — `/takeaway` and `/delivery` render
   the same component with `workspace` set, so `handleTakeawayInitiate`,
   `fetchTakeawayOrders` and their delivery twins are still live code. What is
   removed is the *tab*, not the capability. Read the header comment in that file
   before cutting anything.
3. The `showTakeaway` / `showDelivery` hub settings now control whether those
   **pages** are offered, not tabs. Either repurpose them or remove them — do not
   leave settings that no longer do what they say.
4. Rename to **Dine-In** and move the route to **`/dine-in`**.
5. **Redirect `/hub` → `/dine-in`.** The desktop shortcut, printed cards and any
   bookmark on a staff tablet all point at `/hub`. Breaking them turns a rename
   into a support call.
6. Update every reference: the sidebar
   ([Sidebar.tsx](components/layout/Sidebar.tsx)), the home tiles
   ([app/page.tsx](app/page.tsx)), the "Full POS" link in the pinned workspace
   header, and `landingPathForRole`
   ([admin.types.ts](types/admin.types.ts)).

After this, the four workspaces read consistently: **Dine-In · Takeaway ·
Delivery · Kitchen**.

---

## Part 4 — Order history

Beyond removing the hover-reveal (rule 0.2):

- Give every row an obvious primary action. Today the row does several things
  depending on where it is clicked.
- Status appears as a **labelled** badge, not a bare colour. Colour alone fails
  for colour-blind users and in bright kitchen light.
- Empty states say what to do next, not "No orders found".

---

## Build order

Parts are independent except where noted. Suggested sequence, most value first:

1. **1.1** — the status ladder. One-line root cause, highest impact, and it is
   losing orders today.
2. **1.2 / 1.3** — KDS interaction and the Cancel Order rename. Same files.
3. **2.1** — the catalogue guard. Small, self-contained, prevents a whole class
   of mistake.
4. **2.2 / 2.3** — split payments and the zero-due guard. Build together; 2.3 is
   a condition inside 2.2's UI.
5. **2.4** — receipts. **Do this immediately after 2.2**, not later: between the
   two, split payments exist and print wrongly.
6. **Part 3** — the rename. Touches many files, low risk, easy to review alone.
7. **Part 4 and Part 0 sweep** — as each screen is opened.

---

## How to test it

The functional checks:

1. Dine-in order, KDS: New → Preparing → **Ready → Served** (lands in Served /
   Out and *stays there*) → Close Order. Repeat for takeaway and delivery.
2. Tap a KDS card body: nothing happens. Tap its action button: status advances,
   no panel opens.
3. Open a new dine-in order with no table: catalogue disabled, message explains
   what to do, control in the message fixes it.
4. Take a 33.50 order: pay 20.00 cash, confirm **Left to Pay** shows 13.50, pay
   the rest by card. Both payments listed. Add-payment now disabled.
5. Print that order: both payments on the receipt, total paid correct.
6. Print a single-payment order: **byte-identical to today.**
7. Open `/hub`: lands on `/dine-in`. No Takeaway or Delivery tab. `/takeaway` and
   `/delivery` still work.

And the one that actually matters:

8. **Hand a tablet to someone who has never used this POS and do not help them.**
   Ask them to take a dine-in order for table 4, send it to the kitchen, and take
   payment split between cash and card. Watch where they stop. Every place they
   stop is a bug in this phase, whether or not it is written above.

---

## Out of scope

- The first-sign-in walkthrough. Still deferred, and it should stay deferred
  until the screens it would describe have stopped moving. `landingPathForRole`
  ([admin.types.ts](types/admin.types.ts)) is where it will hook in.
- The Security block on Server Management → System Health, which displays four
  settings that nothing enforces (`requireHttps`, `enableRateLimiting`,
  `rateLimitPerMinute`, `enableAuditLog`). Still needs wiring up or deleting.
  Flagged in Phase 15, unchanged.

---

## What was built

Every part above is implemented. Notes on the decisions that were not spelled
out in the brief, and on what was found on the way.

**A shared status ladder.** `pos_modules/orders/statusLadder.ts` is now the only
place that knows what happens to an order next. The KDS card, the hub list, the
details panel and the order-history rows all read it. Writing it revealed that
the history rows had been sending `serve` and `pay` as PATCH actions — names the
API has never accepted — so those two buttons had only ever produced a 400.
They were hover-only, which is presumably why nobody noticed.

**Payment permissions.** `PATCH /api/orders/[id]` is gated on `ORDER_READ_PERMS`
so a chef can advance a ticket. That also let `view_kitchen` record and (once
`remove_payment` existed) delete payments. Money actions are now re-checked
against `ORDER_WORKSPACE_PERMS`.

**`remove_payment` is new.** §2.2 asks for a Remove control per payment and the
API had no way to undo one; the only remedy was the database. Totals are derived
from `tx` in the model's pre-save hook, so removing the entry is the whole fix.
Refused on a closed order — those payments are an accounting record.

**Settled means `amountDue <= 0`, not `paymentStatus === 'paid'`.** An order paid
across two methods lands on `'split'`. Several places keyed off `'paid'` and so
would have mis-handled exactly the case §2.2 exists to support.

**`/dine-in` had a lock nobody could open.** The layout gated `/hub` on
`allowedRoles: ["super_admin", "manager"]` while the page itself gated on
`manage_orders` and the sidebar offered the link to anyone holding it. A waiter
was shown the door and refused at it. Since `landingPathForRole` now lands
waiters and cashiers there, the layout gate is the permission the page actually
enforces, and `AccessControl` resolves role defaults (`hasPermission`) instead
of testing the stored array — staff-screen accounts have no stored array.

**`showTakeaway` / `showDelivery` were repurposed, not deleted** (§3 point 3).
They now decide whether those *pages* are offered in the sidebar and on the home
screen. A site with `defaultTab` still set to `takeaway` or `delivery` opens
Dine-In on the floor plan rather than on a tab that no longer exists.

**Receipts.** Verified with a script that renders the layout engine at HEAD,
the layout engine now, and the thermal-service mirror against the same data: a
single-payment receipt is byte-identical to before, and the POS and the service
produce identical lines for a split. `xp-thermal-service` is a separate repo —
its half of this change is uncommitted there alongside unrelated
native-migration work.

### Not done

- The Part 0 sweep is confined to the screens this phase touched: the KDS, the
  order editor, the order history, the context bar and the hub. The floor plan
  and admin screens still carry `covers`, and `CatalogItemCard` still has a
  hover-reveal overlay — it is decoration over an always-tappable card, not a
  hidden control, so it fails the letter of 0.2 and not its point.
- Test 8 — the one that actually matters — needs a person.
