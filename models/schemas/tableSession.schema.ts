// models/schemas/tableSession.schema.ts

import { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Session Status - Lifecycle of a table session
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = 
  | 'active'        // Session is currently in progress
  | 'billing'       // Bill has been requested
  | 'paid'          // Payment completed
  | 'closed';       // Session ended and table freed

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  active: 'Active',
  billing: 'Billing',
  paid: 'Paid',
  closed: 'Closed',
};

// ─────────────────────────────────────────────────────────────────────────────
// Session Timeline Event
// ─────────────────────────────────────────────────────────────────────────────

export interface ISessionEvent {
  event: string;                 // e.g., "seated", "ordered", "served", "bill_requested"
  timestamp: Date;
  staffId?: Types.ObjectId;
  details?: string;
}

const SessionEventSchema = new Schema<ISessionEvent>({
  event: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  staffId: { type: Schema.Types.ObjectId, ref: 'Admin' },
  details: { type: String },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// Session Financials - Override defaults from settings
// ─────────────────────────────────────────────────────────────────────────────

export interface ISessionFinancials {
  serviceChargePercentage?: number;  // Override default service charge
  taxOverride?: number;              // Override default tax rate
  discountReason?: string;           // Reason for any discount applied
  discountApprovedBy?: Types.ObjectId;
}

const SessionFinancialsSchema = new Schema<ISessionFinancials>({
  serviceChargePercentage: { type: Number, min: 0, max: 100 },
  taxOverride: { type: Number, min: 0, max: 100 },
  discountReason: { type: String },
  discountApprovedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// Main TableSession Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ITableSession extends Document {
  // Relationships
  tableId: Types.ObjectId;       // Reference to Table
  orderId?: Types.ObjectId;      // Reference to Order (created when session starts)
  
  // Session Info
  sessionNumber: string;         // Human-readable session number
  status: SessionStatus;
  
  // Guest Info
  covers: number;                // Actual number of guests seated
  guestName?: string;            // Optional customer name
  guestPhone?: string;           // Optional customer phone
  
  // Staff
  waiterId: Types.ObjectId;      // Server assigned to this session
  hostId?: Types.ObjectId;       // Who seated the party
  
  // Timing
  seatedAt: Date;                // When guests were seated
  firstOrderAt?: Date;           // When first item was ordered
  firstServedAt?: Date;          // When first item was served
  billRequestedAt?: Date;        // When bill was requested
  paidAt?: Date;                 // When payment was completed
  closedAt?: Date;               // When session was closed
  
  // Financial Overrides
  financials?: ISessionFinancials;
  
  // Timeline
  events: ISessionEvent[];
  
  // Metadata
  notes?: string;
  isVIP?: boolean;
  
  // Audit
  lastStatusChangeAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// TableSession Schema
// ─────────────────────────────────────────────────────────────────────────────

export const TableSessionSchema: Schema = new Schema<ITableSession>(
  {
    // Relationships
    tableId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Table', 
      required: true,
      index: true,
    },
    orderId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Order',
      index: true,
    },
    
    // Session Info
    sessionNumber: { 
      type: String, 
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.keys(SESSION_STATUS_LABELS),
      default: 'active',
    },
    
    // Guest Info
    covers: { type: Number, required: true, min: 1 },
    guestName: { type: String },
    guestPhone: { type: String },
    
    // Staff
    waiterId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Admin', 
      required: true,
      index: true,
    },
    hostId: { type: Schema.Types.ObjectId, ref: 'Admin' },
    
    // Timing
    seatedAt: { type: Date, default: Date.now },
    firstOrderAt: { type: Date },
    firstServedAt: { type: Date },
    billRequestedAt: { type: Date },
    paidAt: { type: Date },
    closedAt: { type: Date },
    
    // Financial Overrides
    financials: SessionFinancialsSchema,
    
    // Timeline
    events: [SessionEventSchema],
    
    // Metadata
    notes: { type: String },
    isVIP: { type: Boolean, default: false },
    
    // Audit
    lastStatusChangeAt: { type: Date, default: Date.now },
  },
  {
    collection: 'table_sessions',
    timestamps: true,
    optimisticConcurrency: true,
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

TableSessionSchema.index({ tableId: 1, status: 1 });
TableSessionSchema.index({ status: 1, seatedAt: -1 });
TableSessionSchema.index({ waiterId: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save: Update lastStatusChangeAt when status changes
// ─────────────────────────────────────────────────────────────────────────────

TableSessionSchema.pre<ITableSession>('save', function () {
  if (this.isModified('status')) {
    this.lastStatusChangeAt = new Date();
    
    // Add event to timeline
    this.events.push({
      event: `status_${this.status}`,
      timestamp: new Date(),
    });
    
    // Update timing fields based on status
    const now = new Date();
    switch (this.status) {
      case 'billing':
        if (!this.billRequestedAt) this.billRequestedAt = now;
        break;
      case 'paid':
        if (!this.paidAt) this.paidAt = now;
        break;
      case 'closed':
        if (!this.closedAt) this.closedAt = now;
        break;
    }
  }
});
