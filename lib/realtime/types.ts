// lib/realtime/types.ts
// Shared types for the real-time event system.
// Events carry rich, version-aware payloads so clients can patch state
// directly without triggering full API refetches.

export type RealtimeEventType =
  | 'table:updated'
  | 'table:session_started'
  | 'table:session_closed'
  | 'order:updated'
  | 'order:items_fired'
  | 'order:items_updated'
  | 'order:completed'
  | 'order:cancelled'
  | 'session:updated'
  | 'session:closed'
  | 'menu:item_created'
  | 'menu:item_updated'
  | 'menu:category_created'
  | 'menu:category_updated'
  | 'settings:updated';

/**
 * User-scoped message type, deliberately OUTSIDE RealtimeEventType.
 *
 * It travels on the same socket as POS events but is addressed to one user's
 * sockets rather than broadcast. Keeping it out of the union is what makes
 * useRealtimeSync ignore it automatically — that hook only forwards types it
 * recognises.
 */
export const DAILY_SHEET_EDIT_CONTEXT_EVENT = 'user:daily_sheet_edit_context_changed';

/** Payload delivered under DAILY_SHEET_EDIT_CONTEXT_EVENT. */
export interface DailySheetEditContextMessage {
  type: typeof DAILY_SHEET_EDIT_CONTEXT_EVENT;
  targetDate: string | null;
  /** Tab that originated the change, so it can ignore its own echo. */
  originTabId?: string;
}

export interface RealtimeEvent {
  /** Discriminator for event type */
  type: RealtimeEventType;
  /** The _id of the entity that changed */
  entityId: string;
  /** Structured payload — rich enough for client-side patching */
  payload?: Record<string, unknown>;
  /** Unix ms timestamp from the server */
  timestamp: number;
  /**
   * MongoDB document version (__v) after the mutation.
   * Clients use this for strict ordering: ignore events with __v <= local __v.
   */
  __v?: number;
}

// ── Order event payload shapes ───────────────────────────────────────────────

/** Payload attached to order:updated, order:completed, order:cancelled */
export interface OrderPatchPayload {
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  grandTotal?: number;
  subtotal?: number;
  taxAmount?: number;
  amountPaid?: number;
  amountDue?: number;
  itemCount?: number;
  action?: string;
  tableNumber?: string;
  tableId?: string;
  /**
   * Vestigial. The server no longer trims payloads — that existed only to stay
   * under Pusher's 10 KB cloud limit and a local socket has no such limit, so
   * nothing sets this any more. Consumers still honour it (a `true` means
   * refetch) and it is kept so they need no change.
   */
  trimmed?: boolean;
}

/** Payload attached to order:items_fired */
export interface ItemsFiredPayload extends OrderPatchPayload {
  firedCount?: number;
  totalItemCount?: number;
}

/** Payload attached to table:updated, table:session_started, table:session_closed */
export interface TablePatchPayload {
  status?: string;
  tableNumber?: string;
  sessionId?: string;
  orderId?: string;
  action?: string;
  trimmed?: boolean;
}

/**
 * Snapshot row returned by GET /api/tables/snapshot
 * — minimal fields for delta-detection on the client.
 */
export interface TableSnapshot {
  _id: string;
  status: string;
  activeSessionId: string | null;
  updatedAt: string; // ISO date
  __v: number;
}
