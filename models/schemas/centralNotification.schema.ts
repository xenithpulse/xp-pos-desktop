// models/schemas/centralNotification.schema.ts
// Compressed schema for XP_ERP central notification storage
// All field names are minimized for space efficiency

import { Schema, Document } from "mongoose";

/**
 * Compressed Notification Document
 * Field mapping:
 *   tn = tenantDb (database name) - using 'tn' to avoid conflict with mongoose 'db'
 *   t  = type (0=success, 1=error, 2=info, 3=warning)
 *   m  = message
 *   r  = resource
 *   ri = resourceId
 *   a  = action
 *   cb = createdBy
 *   rc = recipients
 *   ts = timestamp
 */
export interface ICentralNotification extends Document {
  tn: string;           // tenantDb - which tenant database this came from
  t: number;            // type: 0=success, 1=error, 2=info, 3=warning
  m: string;            // message
  r?: string;           // resource
  ri?: string;          // resourceId
  a?: string;           // action
  cb?: string;          // createdBy
  rc?: string[];        // recipients
  ts: Date;             // timestamp
}

export const CentralNotificationSchema: Schema<ICentralNotification> = new Schema(
  {
    tn: { 
      type: String, 
      required: true, 
      index: true,    // Index for fast tenant-based queries
    },
    t: { 
      type: Number, 
      required: true,
      min: 0,
      max: 3,
      index: true,    // Index for filtering by type
    },
    m: { 
      type: String, 
      required: true,
      maxlength: 500, // Limit message length for storage efficiency
    },
    r: { 
      type: String,
      maxlength: 50,
    },
    ri: { 
      type: String,
      maxlength: 50,
    },
    a: { 
      type: String,
      maxlength: 30,
    },
    cb: { 
      type: String,
      maxlength: 50,
    },
    rc: { 
      type: [String],
      default: undefined, // Don't store empty arrays
    },
    ts: { 
      type: Date, 
      default: Date.now,
      index: true,    // Index for time-based queries
    },
  },
  {
    // Disable _id versioning for lighter documents
    versionKey: false,
    // Use smaller collection name
    collection: "cn", // "central_notifications" → "cn"
    // Optimize for insert-heavy workload
    timestamps: false, // We use 'ts' manually
  }
);

// Compound index for common query patterns
CentralNotificationSchema.index({ tn: 1, ts: -1 });
CentralNotificationSchema.index({ t: 1, ts: -1 });
