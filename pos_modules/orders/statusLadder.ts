// pos_modules/orders/statusLadder.ts
// Single source of truth for "what happens to this order next".
//
// Phase 16 §1.1. Before this file, three screens each carried their own copy of
// the ladder and they disagreed. The worst copy was the KDS card's, which
// offered `complete` straight from `ready` for dine-in and takeaway: the order
// skipped `served` entirely, jumped to `completed`, dropped out of every
// active-orders filter and vanished off the board mid-service. The Served / Out
// column was unreachable for dine-in because nothing in the KDS ever set
// `served`.
//
// Decision recorded (Phase 16 §1.1, recommendation accepted): **the KDS stops
// at Served / Out.** A kitchen must not close an order — closing settles the
// bill, and that is the till's job. `surface: 'kds'` therefore returns no action
// from `served` / `out_for_delivery`; `surface: 'hub'` keeps it.

import type { LucideIcon } from 'lucide-react';
import { Check, Play, CheckCircle2, Truck, HandPlatter, Package } from 'lucide-react';
import type { OrderMode, OrderStatus } from '@/types/order.types';

/** Which screen is asking. The kitchen board and the management hub stop at
 *  different rungs — see the decision note above. */
export type OrderSurface = 'kds' | 'hub';

export type StatusActionColor = 'blue' | 'amber' | 'green' | 'cyan' | 'purple' | 'emerald';

export interface StatusAction {
  /** PATCH `action` sent to /api/orders/[id]. */
  action: string;
  /** What goes on the button. Always present — rule 0.1, never an icon alone. */
  label: string;
  icon: LucideIcon;
  color: StatusActionColor;
}

/**
 * The next step for an order, or null when there is nothing left to do on this
 * surface.
 *
 * | Status             | Dine-in       | Takeaway        | Delivery              |
 * |--------------------|---------------|-----------------|-----------------------|
 * | `ready`            | Served        | Collected       | Out for Delivery      |
 * | `served`           | Close Order † | Close Order †   | —                     |
 * | `out_for_delivery` | —             | —               | Delivered †           |
 *
 * † hub only; the KDS has no action from these.
 */
export function getNextStatusAction(
  status: OrderStatus,
  mode: OrderMode,
  surface: OrderSurface = 'hub',
): StatusAction | null {
  switch (status) {
    case 'draft':
      return { action: 'confirm', label: 'Confirm Order', icon: Check, color: 'blue' };

    case 'confirmed':
      return { action: 'start_preparing', label: 'Start Preparing', icon: Play, color: 'amber' };

    case 'preparing':
      return { action: 'mark_ready', label: 'Ready', icon: CheckCircle2, color: 'green' };

    case 'ready':
      // Delivery leaves the building; everything else is handed over on the
      // premises. Both land in Served / Out and stay there.
      if (mode === 'delivery') {
        return { action: 'out_for_delivery', label: 'Out for Delivery', icon: Truck, color: 'purple' };
      }
      return mode === 'dine_in'
        ? { action: 'mark_served', label: 'Served', icon: HandPlatter, color: 'cyan' }
        : { action: 'mark_served', label: 'Collected', icon: Package, color: 'cyan' };

    case 'served':
      if (surface === 'kds') return null;
      return { action: 'complete', label: 'Close Order', icon: CheckCircle2, color: 'emerald' };

    case 'out_for_delivery':
      if (surface === 'kds') return null;
      return { action: 'complete', label: 'Delivered', icon: CheckCircle2, color: 'emerald' };

    default:
      // completed / cancelled — the ladder ends here.
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status trail — the same ladder, read as "where is this order now"
// ─────────────────────────────────────────────────────────────────────────────

export interface TrailStep {
  status: OrderStatus;
  label: string;
}

/**
 * The rungs an order of this mode passes through, in order. Used to draw a
 * status strip so the current state is readable on its own, instead of being
 * inferred from which buttons happen to be showing (Phase 16 §1.3).
 */
export function getStatusTrail(mode: OrderMode): TrailStep[] {
  const start: TrailStep[] = [
    { status: 'confirmed', label: 'Confirmed' },
    { status: 'preparing', label: 'Preparing' },
    { status: 'ready', label: 'Ready' },
  ];

  if (mode === 'delivery') {
    return [
      ...start,
      { status: 'out_for_delivery', label: 'Out for Delivery' },
      { status: 'completed', label: 'Delivered' },
    ];
  }

  return [
    ...start,
    { status: 'served', label: mode === 'dine_in' ? 'Served' : 'Collected' },
    { status: 'completed', label: 'Closed' },
  ];
}

/** Index of the order's current rung, or -1 when it has not started
 *  (`draft`) or has left the ladder (`cancelled`). */
export function getTrailPosition(status: OrderStatus, trail: TrailStep[]): number {
  return trail.findIndex((step) => step.status === status);
}
