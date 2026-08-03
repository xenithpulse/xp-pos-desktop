// lib/updates/service-state.ts
//
// Whether the restaurant is mid-service.
//
// "An update never begins while orders are open" is an acceptance criterion for
// the update channel, and it is the one that decides whether a customer trusts
// this feature at all: an appliance that restarts itself while a waiter is
// holding a tablet has broken the restaurant's evening.
//
// Read-only. Nothing here writes to the database.

// NOTE: lib/mongoose and the Order model are imported INSIDE getServiceActivity,
// not at module scope.
//
// lib/mongoose.ts throws on import when TENANT_DB or MONGODB_URI is missing.
// This module sits in the update agent's import graph, and the agent is started
// from instrumentation.ts - so a static import here would put "the .env is
// wrong" on the path that decides whether the POS starts AT ALL, rather than on
// the path that decides whether a request can reach the database. A misconfigured
// site should come up and say what is wrong, not refuse to boot.

// Order status codes, from models/factories/Order.ts:
//   0 draft  1 confirmed  2 preparing  3 ready  4 served
//   5 out_for_delivery    6 completed  7 cancelled
const STATUS_DRAFT = 0;
const STATUS_COMPLETED = 6;

/**
 * A draft older than this is an abandoned till screen, not live service.
 *
 * Drafts are treated differently from every other open status on purpose. A
 * confirmed order is unambiguously live and must block. A draft is an order
 * somebody started building and may simply have walked away from — and drafts
 * are never cleaned up, so counting every one of them would wedge the update
 * channel permanently on any site that has ever abandoned one. Recent drafts
 * still block, because a draft edited two minutes ago IS somebody at the till.
 */
const DRAFT_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export interface ServiceActivity {
  /** Confirmed through out-for-delivery. Any of these blocks an install. */
  openOrders: number;
  /** Drafts touched inside the active window. These block too. */
  activeDrafts: number;
  /** Drafts older than the window. Reported, but never a blocker. */
  staleDrafts: number;
  /** True when it is safe, order-wise, to restart the POS. */
  idle: boolean;
}

/**
 * Count what is in flight.
 *
 * Throws if the database is unreachable. Callers MUST treat that as "not
 * idle": failing to reach Mongo is not evidence that the restaurant is closed,
 * and defaulting to "safe to restart" there is exactly the wrong direction.
 */
export async function getServiceActivity(): Promise<ServiceActivity> {
  const [{ mongooseConnect }, { OrderModel }] = await Promise.all([
    import("@/lib/mongoose"),
    import("@/models/factories/Order"),
  ]);

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const draftCutoff = new Date(Date.now() - DRAFT_ACTIVE_WINDOW_MS);

  const [openOrders, activeDrafts, staleDrafts] = await Promise.all([
    Order.countDocuments({ s: { $gt: STATUS_DRAFT, $lt: STATUS_COMPLETED } }),
    Order.countDocuments({ s: STATUS_DRAFT, uAt: { $gte: draftCutoff } }),
    Order.countDocuments({ s: STATUS_DRAFT, uAt: { $lt: draftCutoff } }),
  ]);

  return {
    openOrders,
    activeDrafts,
    staleDrafts,
    idle: openOrders === 0 && activeDrafts === 0,
  };
}
