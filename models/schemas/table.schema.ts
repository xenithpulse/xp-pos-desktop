// models/schemas/table.schema.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Table Schema (Compressed Storage)
// Uses short field names and numeric codes to minimize storage and network payload
// Human-readable types and labels are exported for UI/API layer
// ═══════════════════════════════════════════════════════════════════════════════

import { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Table Status - Current availability state
// ─────────────────────────────────────────────────────────────────────────────

export type TableStatus = 
  | 'available'     // Table is free and can be occupied
  | 'reserved'      // Table has an upcoming reservation
  | 'occupied'      // Table is currently in use (active session)
  | 'cleaning'      // Table needs to be cleaned
  | 'blocked';      // Table is temporarily unavailable

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  blocked: 'Blocked',
};

// ─────────────────────────────────────────────────────────────────────────────
// Table Shape - Physical shape for UI rendering
// ─────────────────────────────────────────────────────────────────────────────

export type TableShape = 
  | 'square'        // Square table (equal width/height)
  | 'rectangle'     // Rectangular table
  | 'round'         // Circular table
  | 'oval';         // Oval/elliptical table

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  square: 'Square',
  rectangle: 'Rectangle',
  round: 'Round',
  oval: 'Oval',
};

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Value Mappings (for reference)
// ─────────────────────────────────────────────────────────────────────────────
// Table Status (s): 0=available, 1=reserved, 2=occupied, 3=cleaning, 4=blocked
// Table Shape (sh): 0=square, 1=rectangle, 2=round, 3=oval
// isActive (ia): 0=false, 1=true

// ─────────────────────────────────────────────────────────────────────────────
// Table Section (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export interface ITableSection {
  _id?: Types.ObjectId;
  n: string;                     // name
  cl?: string;                   // color
  fl?: number;                   // floorLevel
  ia: number;                    // isActive (0=false, 1=true)
}

export const TableSectionSchema = new Schema<ITableSection>({
  n: { type: String, required: true },
  cl: { type: String, default: '#6366f1' },
  fl: { type: Number, default: 0 },
  ia: { type: Number, enum: [0, 1], default: 1 },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Reservation Info (Compressed)
//
// Reservations live as an array on the table (`rs`) so one table can hold
// several bookings across a service — an 18:00 and a 21:00 sitting are two
// separate documents, not a single slot that blocks the whole evening.
//
// Timing fields are per-reservation OVERRIDES of the tenant policy in
// settings.hub; when absent the policy value applies. See
// lib/reservations/schedule.ts for how they combine.
//
// Status (st): 0=booked, 1=seated, 2=cancelled, 3=no_show, 4=completed
// ─────────────────────────────────────────────────────────────────────────────

export interface IReservation {
  _id?: Types.ObjectId;
  cn: string;                    // customerName
  cp?: string;                   // customerPhone
  ps: number;                    // partySize
  rt: Date;                      // reservationTime
  du?: number;                   // durationMinutes  (override)
  hm?: number;                   // holdMinutes      (override)
  gm?: number;                   // graceMinutes     (override)
  st: number;                    // status (0-4)
  nt?: string;                   // notes
  sid?: Types.ObjectId;          // sessionId — set when the guest is seated
  aAt?: Date;                    // arrivedAt
  rn?: string;                   // resolutionNote (cancel reason / no-show note)
  cAt: Date;                     // createdAt
  uAt?: Date;                    // updatedAt
}

const ReservationSchema = new Schema<IReservation>({
  cn: { type: String, required: true },
  cp: { type: String },
  ps: { type: Number, required: true, min: 1 },
  rt: { type: Date, required: true },
  du: { type: Number, min: 0 },
  hm: { type: Number, min: 0 },
  gm: { type: Number, min: 0 },
  st: { type: Number, enum: [0, 1, 2, 3, 4], default: 0 },
  nt: { type: String },
  sid: { type: Schema.Types.ObjectId, ref: 'TableSession' },
  aAt: { type: Date },
  rn: { type: String },
  cAt: { type: Date, default: Date.now },
  uAt: { type: Date },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Main Table Interface (Compressed Storage)
// ─────────────────────────────────────────────────────────────────────────────

export interface ITable extends Document {
  // Identity
  tn: string;                    // tableNumber
  n?: string;                    // name
  
  // Physical Layout
  si?: Types.ObjectId;           // sectionId
  sn?: string;                   // sectionName
  x: number;                     // x_position
  y: number;                     // y_position
  w: number;                     // width
  h: number;                     // height
  o: number;                     // orientation
  sh: number;                    // shape (0-3)
  
  // Capacity
  c: number;                     // capacity
  mc?: number;                   // minCovers
  
  // Status
  s: number;                     // status (0-4)
  as?: Types.ObjectId;           // activeSessionId
  
  // Reservations
  rs: IReservation[];            // reservations (authoritative queue)
  r?: IReservation;              // legacy single reservation — lifted into rs on read

  // Display
  cl?: string;                   // color
  ia: number;                    // isActive (0=false, 1=true)

  // Grouping
  gi?: string;                   // groupId
  so?: number;                   // sortOrder
  
  // Timestamps
  cAt: Date;                     // createdAt
  uAt: Date;                     // updatedAt
  lsc?: Date;                    // lastStatusChangeAt
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Schema (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export const TableSchema: Schema = new Schema<ITable>(
  {
    // Identity
    tn: { type: String, required: true, unique: true, index: true },
    n: { type: String },
    
    // Physical Layout
    si: { type: Schema.Types.ObjectId, ref: 'TableSection' },
    sn: { type: String },
    x: { type: Number, required: true, default: 0 },
    y: { type: Number, required: true, default: 0 },
    w: { type: Number, required: true, default: 100, min: 30, max: 600 },
    h: { type: Number, required: true, default: 100, min: 30, max: 600 },
    o: { type: Number, default: 0, min: 0, max: 360 },
    sh: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    
    // Capacity
    c: { type: Number, required: true, default: 4, min: 1 },
    mc: { type: Number, min: 1 },
    
    // Status
    s: { type: Number, enum: [0, 1, 2, 3, 4], default: 0 },
    as: { type: Schema.Types.ObjectId, ref: 'TableSession' },
    
    // Reservations
    rs: { type: [ReservationSchema], default: [] },
    r: ReservationSchema,        // legacy — migrated into rs by reconcileTableReservations

    // Display
    cl: { type: String },
    ia: { type: Number, enum: [0, 1], default: 1 },

    // Grouping & Ordering
    gi: { type: String, default: null },
    so: { type: Number, default: 0 },
    
    // Audit
    lsc: { type: Date },
  },
  {
    collection: 'tables',
    timestamps: { createdAt: 'cAt', updatedAt: 'uAt' },
    optimisticConcurrency: true,
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

TableSchema.index({ si: 1, s: 1 });  // sectionId + status
TableSchema.index({ s: 1 });          // status
TableSchema.index({ ia: 1 });         // isActive
TableSchema.index({ 'rs.rt': 1, 'rs.st': 1 }); // upcoming-reservation sweeps

// ─────────────────────────────────────────────────────────────────────────────
// UI Colors for Table States
// ─────────────────────────────────────────────────────────────────────────────

export const TABLE_STATUS_COLORS: Record<TableStatus, { bg: string; border: string; text: string }> = {
  available: { 
    bg: 'bg-violet-500/20', 
    border: 'border-violet-500/50', 
    text: 'text-violet-300' 
  },
  reserved: { 
    bg: 'bg-teal-500/20', 
    border: 'border-teal-500/50', 
    text: 'text-teal-300' 
  },
  occupied: { 
    bg: 'bg-amber-500/20', 
    border: 'border-amber-500/50', 
    text: 'text-amber-300' 
  },
  cleaning: { 
    bg: 'bg-gray-500/20', 
    border: 'border-gray-500/50', 
    text: 'text-gray-300' 
  },
  blocked: { 
    bg: 'bg-red-500/20', 
    border: 'border-red-500/50', 
    text: 'text-red-300' 
  },
};
