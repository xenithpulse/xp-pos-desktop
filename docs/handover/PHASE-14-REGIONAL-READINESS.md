# Phase 14 — Regional readiness: South Asia, Middle East, Western markets

**Status:** not started
**Depends on:** Phase 13 (the delivery module) for one item — delivery-fee tax
display — otherwise independent and could run in parallel.
**Risk:** medium. Most of this is polish, but one item (Saudi e-invoicing) is a
genuine legal requirement in a market you've named as a target, not a
nice-to-have. Treat that section as a scoping question for a lawyer, not
something this document resolves.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Scope, as directed

- **India is explicitly out of scope for now.** This removes the biggest single
  source of complexity from this phase — GST's multi-slab, CGST+SGST
  split-line receipt requirement does not need solving today.
- **Multi-location / chain support is explicitly deferred.** The product sells
  to single restaurant owners right now. See "Deliberately not built" below for
  why this is a real future phase, sketched but not started.
- **Full UI translation (i18n) is explicitly out of scope.** One narrower,
  customer-facing exception is proposed below — flagged as something to confirm
  before building, not something this phase assumes.

## What's already solid — verified this session, do not redo

- **Currency**: the full GCC set, including the three-decimal currencies
  everyone forgets (KWD, BHD, OMR at `decimals: 3`), and the full South Asian
  set (PKR, BDT, LKR, NPR), all with correct symbols and locales
  (`types/settings.types.ts:314+`).
- **Payment methods are already a configurable array, not a fixed enum**
  (`types/settings.types.ts:163`) — its own doc comment uses `jazzcash` as the
  example ID. Adding Easypaisa, UPI-adjacent methods, or Mada is a config
  change, not new engineering.
- **Tax is already per-item**, not one global rate: `taxRate` and
  `taxInclusive` live on each menu item (`models/schemas/menu.schema.ts:139-140,
  223-224`). A UK restaurant with different VAT treatment for eat-in vs.
  takeaway versions of the same dish can already model that as two menu items
  with different rates — worth *confirming* this covers real cases before
  building anything new here, not assuming more engineering is needed.
- **The tax registration number already prints on receipts** when set
  (`pos_modules/orders/order-editor/useOrderEditorState.ts`, the `taxRegNumber`
  / TRN block) — relevant to every VAT jurisdiction in scope here.
- **Offline-first architecture sidesteps most data-residency questions** that
  come up selling into the EU or GCC — customer data never leaves the
  building, because there is no cloud database to leave it from.

## What's needed

### 1. Saudi Arabia: ZATCA e-invoicing (Fatoora) — a legal question, not a feature request

This is **already enforced**, not upcoming: Phase 1 of ZATCA's e-invoicing
mandate has required a QR code with a cryptographic stamp on simplified tax
invoices since December 2021, and Phase 2 is rolling out real-time integration
requirements by taxpayer group. If Saudi Arabia is a near-term sales target,
this needs to be scoped with a local accountant or ZATCA-integration
specialist before you sell there — not inferred from this document, and not
something I'm qualified to certify compliance against. If Saudi Arabia is a
later-stage target rather than immediate, this can wait; say so explicitly
before the next phase starts, because it changes the priority order a lot.

The UAE's equivalent (FTA e-invoicing) is not yet enforced on the same
timeline, so it is lower urgency even though it is the same market region.

### 2. Allergen management — schema exists, no UI

`allergens` is already a field on every menu item (`models/schemas/menu.schema.ts`,
`lib/demo-data/menu.ts`), populated as an empty array and never editable or
displayed anywhere. Lower urgency for South Asia and the Gulf, but a real
labeling expectation — approaching a legal one in some cases (the UK's
Natasha's Law, US allergen-disclosure norms) — for Western markets. Build:
an editor in the menu-item admin form, and a print/display surface (receipt
or menu) that shows it when present.

### 3. Bilingual receipts for the Gulf — ask before building, not a default

This is deliberately scoped narrow, to stay clearly on the "not multilingual"
side of the line that was set for this project. **Not** proposing: translating
the admin UI, the login screen, or any staff-facing surface. What GCC
restaurants commonly do expect: an Arabic line alongside the English on a
**printed customer receipt**, and sometimes on customer-facing menu displays.

If wanted, this would be a narrow addition — an optional secondary-language
field per menu item and a receipt-template toggle — not an application-wide
translation framework. Flagging it here rather than building it, because it
sits close enough to the "no multilingual" boundary that it deserves a direct
yes/no before any code gets written.

### 4. Delivery-fee tax display (depends on Phase 13)

Once delivery orders exist, GCC and Western customers generally expect the
delivery fee to be shown as its own line with its own tax treatment on the
receipt, not folded silently into the item total. Small addition once Phase 13
ships; not worth starting before it does.

---

## Deliberately not built — the "online data flush" for chains

Directly from the brief that shaped this phase: multi-location support is a
**future, separate version of the product**, not something to build now
because there is no chain customer to build it for yet.

Sketching the shape so it isn't lost, without starting it:

Each site keeps running **exactly as it does today** — fully offline-capable,
surviving a power cut with nobody logged in, no functional regression for the
single-site customer this phase is built for. Additionally, each site would
queue a compact summary of completed transactions locally. When the site has
internet, that queue flushes to a central database — XenithPulse-operated or
customer-operated — for cross-location reporting. The offline behavior is not
replaced by this; it's a layer bolted on top, because a chain owner's
individual restaurant still needs to survive an internet outage exactly like a
single-site customer's does.

This is real design work — conflict resolution when a queued flush arrives out
of order, what happens to a site's own trial/licence state relative to a
group licence, how much the central side needs to know versus just receiving
opaque summaries — and belongs in its own phase, once there is a paying
multi-location customer asking for it. Building it speculatively now spends
effort with no confirmed buyer, which is the opposite of "ASAP."

---

## Acceptance criteria

- [ ] **Explicit answer recorded** on whether Saudi Arabia is near-term —
      this phase's own priority order depends on it
- [ ] If Saudi Arabia is near-term: ZATCA requirements scoped with a
      qualified local integrator or accountant, not assumed from this document
- [ ] Allergen editor and display shipped
- [ ] Bilingual receipt: built only if explicitly confirmed wanted; skipped
      otherwise, without that being treated as unfinished work
- [ ] `npx tsc --noEmit` clean, `installer\build.ps1` green

## Watch out for

- Do not let "bilingual receipts" quietly expand into UI translation. It is a
  narrow, customer-facing, explicitly-scoped exception — not a foot in the door
  for full i18n.
- Fiscal and e-invoicing rules change. Verify current requirements with local
  counsel before selling into any newly-regulated market — this document is
  not legal advice and was not written by anyone qualified to give it.
- The "online data flush" sketch above is a starting point for a future
  conversation, not a spec. Don't start building it from this paragraph alone.
