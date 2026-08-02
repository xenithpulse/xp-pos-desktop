// types/table.types.ts
// Client-side types for tables and sessions

import {
  DEFAULT_RESERVATION_POLICY,
  ReservationPolicy,
  ScheduledReservation,
  getActiveReservation,
  getUpcoming,
  getWalkInWindow,
  isBlocking,
  projectTableStatus,
} from '@/lib/reservations/schedule';

export type {
  ReservationPhase,
  ReservationPolicy,
  ReservationStatus,
  ScheduledReservation,
  WalkInWindow,
} from '@/lib/reservations/schedule';

export {
  DEFAULT_RESERVATION_POLICY,
  PHASE_LABELS,
  RESERVATION_STATUS_LABELS,
  describeReservation,
  formatClock,
  formatDuration,
  formatRelative,
  getPhase,
  getTiming,
  getUpcoming,
  getWalkInWindow,
  findConflicts,
  projectWalkInOverrun,
  resolvePolicy,
} from '@/lib/reservations/schedule';

// ─────────────────────────────────────────────────────────────────────────────
// Table Types
// ─────────────────────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'blocked';
export type TableShape = 'square' | 'rectangle' | 'round' | 'oval';
export type SessionStatus = 'active' | 'billing' | 'paid' | 'closed';

/**
 * A booking on a table. Tables carry a queue of these (`reservations`), so one
 * table can hold an 18:00 and a 21:00 sitting without either blocking the other.
 * Timing fields are optional per-booking overrides of the tenant policy.
 */
export interface IReservation extends ScheduledReservation {
  createdAt?: string;
}

export interface ITable {
  _id: string;
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  orientation: number;
  shape: TableShape;
  capacity: number;
  minCovers: number;
  status: TableStatus;
  activeSessionId?: string | ITableSession;
  /** Every booking on this table — upcoming, seated and resolved. */
  reservations?: IReservation[];
  /** @deprecated legacy single slot; the API lifts it into `reservations`. */
  currentReservation?: IReservation;
  color?: string;
  groupId?: string;
  sortOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ITableSection {
  _id: string;
  name: string;
  floorNumber: number;
  color?: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Session Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ISessionEvent {
  event: string;
  details?: string;
  staffId?: string;
  timestamp: string;
}

export interface ISessionFinancials {
  serviceChargePercentage: number;
  taxOverride?: number;
  discountReason?: string;
}

export interface ITableSession {
  _id: string;
  tableId: string | ITable;
  orderId: string | any; // IOrder from order.types
  sessionNumber: string;
  status: SessionStatus;
  covers: number;
  waiterId?: string | any;
  hostId?: string | any;
  seatedAt: string;
  firstOrderAt?: string;
  firstServedAt?: string;
  billRequestedAt?: string;
  paidAt?: string;
  closedAt?: string;
  financials: ISessionFinancials;
  events: ISessionEvent[];
  notes?: string;
  guestTags: string[];
  lastStatusChangeAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label & Color Mappings
// ─────────────────────────────────────────────────────────────────────────────

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  blocked: 'Blocked',
};

export const TABLE_STATUS_COLORS: Record<TableStatus, { bg: string; text: string; border: string }> = {
  available: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  reserved: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  occupied: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  cleaning: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  blocked: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
};

// Color values for visual rendering (hex/rgb)
export const TABLE_STATUS_FILL_COLORS: Record<TableStatus, string> = {
  available: '#E9D5FF', // Light Purple
  reserved: '#99F6E4',  // Teal
  occupied: '#FFDAB9',  // Peach
  cleaning: '#FEF08A',  // Yellow
  blocked: '#D1D5DB',   // Gray
};

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  square: 'Square',
  rectangle: 'Rectangle',
  round: 'Round',
  oval: 'Oval',
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: 'Active',
  billing: 'Billing',
  paid: 'Paid',
  closed: 'Closed',
};

export const SESSION_STATUS_COLORS: Record<SessionStatus, { bg: string; text: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  billing: { bg: 'bg-amber-100', text: 'text-amber-800' },
  paid: { bg: 'bg-blue-100', text: 'text-blue-800' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

// ─────────────────────────────────────────────────────────────────────────────
// API Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TablePositionUpdate {
  tableId: string;
  x_position: number;
  y_position: number;
  orientation?: number;
  width?: number;
  height?: number;
}

export interface InitiateTableRequest {
  tableId: string;
  covers?: number;
  waiterId?: string;
  notes?: string;
}

export interface InitiateTableResponse {
  success: boolean;
  session: ITableSession;
  order: any; // IOrder
  table: ITable;
}

export interface CreateTableRequest {
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position?: number;
  y_position?: number;
  width?: number;
  height?: number;
  orientation?: number;
  shape?: TableShape;
  capacity?: number;
  minCovers?: number;
  color?: string;
}

export interface TableUpdateRequest {
  tableNumber?: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position?: number;
  y_position?: number;
  width?: number;
  height?: number;
  orientation?: number;
  shape?: TableShape;
  capacity?: number;
  minCovers?: number;
  status?: TableStatus;
  color?: string;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Template Engine Types
// ─────────────────────────────────────────────────────────────────────────────

export type LayoutPattern =
  | 'grid'
  | 'diagonal'
  | 'circle'
  | 'banquet'
  | 'u-shape'
  | 'boardroom'
  | 'booth-row'
  | 'serpentine'
  | 'checkerboard';

export interface LayoutTemplateParams {
  pattern: LayoutPattern;
  rows: number;
  cols: number;
  spacing: number;              // Gap between tables in px
  startX: number;               // Origin X on canvas
  startY: number;               // Origin Y on canvas
  shape: TableShape;
  tableWidth: number;
  tableHeight: number;
  capacity: number;
  prefix: string;               // e.g. "T" -> T1..Tn
  sectionId?: string;
  sectionName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone Metadata (background textures/images per zone)
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneMetadata {
  backgroundImage?: string;     // URL or data-uri for floor texture
  backgroundTexture?: 'wood' | 'stone' | 'tile' | 'carpet' | 'concrete' | 'none';
  opacity?: number;             // Texture overlay opacity 0-1
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo/Redo Snapshot
// ─────────────────────────────────────────────────────────────────────────────

export interface TablePropertyEdits {
  tableNumber?: string;
  name?: string;
  capacity?: number;
  shape?: TableShape;
  orientation?: number;
  width?: number;
  height?: number;
  sectionId?: string;
  sectionName?: string;
  color?: string;
}

export interface CanvasSnapshot {
  pendingUpdates: Record<string, TablePositionUpdate>;
  pendingEdits: Record<string, TablePropertyEdits>;
  draftTables: DraftTable[];
  stagedDeletions: string[]; // IDs of existing tables staged for deletion
}

export interface DraftTable extends Omit<ITable, '_id' | 'createdAt' | 'updatedAt'> {
  _draftId: string;             // Client-side UUID for React keys
  _isNew: boolean;              // True until persisted
}

// ─────────────────────────────────────────────────────────────────────────────
// Distance Marker (for canvas distance labels)
// ─────────────────────────────────────────────────────────────────────────────

export interface DistanceMarker {
  /** Start X in canvas-space */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance in pixels */
  distance: number;
  /** 'h' = horizontal gap, 'v' = vertical gap */
  axis: 'h' | 'v';
}

export interface LayoutState {
  mode: 'view' | 'edit' | 'playground';
  draftTables: DraftTable[];
  selectedIds: Set<string>;     // Multi-select (_id or _draftId)
  isDirty: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Upsert Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BulkUpsertTableItem {
  _id?: string;                 // Present for existing tables (update), absent for new (create)
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  orientation: number;
  shape: TableShape;
  capacity: number;
  minCovers?: number;
  color?: string;
  groupId?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface BulkUpsertRequest {
  tables: BulkUpsertTableItem[];
}

export interface BulkUpsertResponse {
  success: boolean;
  created: number;
  updated: number;
  tables: ITable[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate elapsed time since a given date
 */
export function getElapsedTime(startTime: string | Date): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format currency for display.
 * Reads settings from global POS store when available.
 */
export function formatCurrency(amount: number, currency?: string): string {
  let symbol = currency;
  let locale = 'en-IN';
  let decimals = 2;
  let position: 'before' | 'after' = 'before';
  if (!symbol) {
    try {
      const { usePOSStore } = require('@/stores/posStore');
      const settings = usePOSStore.getState().settings;
      if (settings) {
        symbol = settings.currencySymbol;
        locale = settings.currencyLocale || 'en-PK';
        if (typeof settings.currencyDecimals === 'number') decimals = settings.currencyDecimals;
        if (settings.currencySymbolPosition === 'after') position = 'after';
      }
    } catch {}
  }
  if (!symbol) symbol = 'Rs.';
  const safe = Number.isFinite(amount) ? amount : 0;
  const num = safe.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Space-separated when the symbol trails, per common convention ("5 kr").
  return position === 'after' ? `${num} ${symbol}` : `${symbol}${num}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reservation-aware table helpers
//
// These read the reservation queue rather than the stored status, so the floor
// plan stays correct between fetches — a hold window that opens at 20:30 shows
// up at 20:30 without waiting for the server to write anything.
// ─────────────────────────────────────────────────────────────────────────────

/** All bookings on a table, tolerating the legacy single-slot shape. */
export function getTableReservations(table: ITable): ScheduledReservation[] {
  if (table.reservations?.length) return table.reservations;
  if (table.currentReservation) return [table.currentReservation];
  return [];
}

/** Bookings that still matter, soonest first. */
export function getTableUpcoming(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ScheduledReservation[] {
  return getUpcoming(getTableReservations(table), now, policy);
}

/** The booking staff should act on — the one holding the table, else the next. */
export function getTableActiveReservation(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ScheduledReservation | null {
  return getActiveReservation(getTableReservations(table), now, policy);
}

/** How long this table can be sold to a walk-in before its next hold. */
export function getTableWalkInWindow(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
) {
  return getWalkInWindow(getTableReservations(table), now, policy);
}

/**
 * The status the table should be showing right now.
 *
 * Derived rather than read straight off `table.status` so a table booked for
 * later renders as available until its hold window actually opens.
 */
export function getEffectiveTableStatus(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): TableStatus {
  const hasSession =
    !!table.activeSessionId &&
    (typeof table.activeSessionId !== 'object' ||
      (table.activeSessionId as ITableSession).status === 'active' ||
      (table.activeSessionId as ITableSession).status === 'billing');

  return projectTableStatus(
    table.status,
    getTableReservations(table),
    hasSession,
    now,
    policy,
  ) as TableStatus;
}

/**
 * Can a party be seated here without further confirmation?
 *
 * True for a free table, including one with a booking still outside its hold
 * window. Inside the hold window it returns false — not because seating is
 * impossible, but because it needs either the booking's own "Guest Arrived"
 * CTA or an explicit walk-in override.
 */
export function canSeatTable(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  const status = getEffectiveTableStatus(table, now, policy);
  if (status === 'occupied' || status === 'cleaning' || status === 'blocked') return false;
  return !getTableReservations(table).some((r) => isBlocking(r, now, policy));
}

/**
 * Can staff seat *something* here — a walk-in with an override, or the booked
 * party itself? Used to decide whether the panel offers seating controls.
 */
export function canSeatWithOverride(
  table: ITable,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  const status = getEffectiveTableStatus(table, now, policy);
  return status === 'available' || status === 'reserved';
}
