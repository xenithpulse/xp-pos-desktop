// lib/helpers/notifyCompression.ts
// Compression mapping for central notification forwarding to XP_ERP

/**
 * Type mapping: string → number
 * 0 = success, 1 = error, 2 = info, 3 = warning
 */
export const TYPE_MAP = {
  success: 0,
  error: 1,
  info: 2,
  warning: 3,
} as const;

export const TYPE_REVERSE_MAP = {
  0: "success",
  1: "error",
  2: "info",
  3: "warning",
} as const;

/**
 * Field name mapping: full → compressed
 */
export const FIELD_MAP = {
  tenantDb: "tn",      // Database name (using 'tn' to avoid mongoose conflict)
  type: "t",           // Notification type (0-3)
  message: "m",        // Message content
  resource: "r",       // Resource name
  resourceId: "ri",    // Resource ID
  action: "a",         // Action performed
  createdBy: "cb",     // Creator
  recipients: "rc",    // Recipients array
  createdAt: "ts",     // Timestamp
} as const;

export type CompressedType = 0 | 1 | 2 | 3;
export type FullType = "success" | "error" | "info" | "warning";

/**
 * Compressed notification payload for XP_ERP
 */
export interface CompressedNotification {
  tn: string;          // tenantDb
  t: CompressedType;   // type (0-3)
  m: string;           // message
  r?: string;          // resource
  ri?: string;         // resourceId
  a?: string;          // action
  cb?: string;         // createdBy
  rc?: string[];       // recipients
  ts?: Date;           // timestamp
}

/**
 * Compress a notification payload for storage in XP_ERP
 */
export function compressNotification(data: {
  tenantDb: string;
  message: string;
  type?: FullType;
  resource?: string;
  resourceId?: string;
  action?: string;
  createdBy?: string;
  recipients?: string[];
}): CompressedNotification {
  const compressed: CompressedNotification = {
    tn: data.tenantDb,
    t: TYPE_MAP[data.type || "info"],
    m: data.message,
    ts: new Date(),
  };

  // Only add optional fields if they have values (saves space)
  if (data.resource) compressed.r = data.resource;
  if (data.resourceId) compressed.ri = data.resourceId;
  if (data.action) compressed.a = data.action;
  if (data.createdBy) compressed.cb = data.createdBy;
  if (data.recipients?.length) compressed.rc = data.recipients;

  return compressed;
}

/**
 * Decompress a notification from XP_ERP for reading
 */
export function decompressNotification(compressed: CompressedNotification): {
  tenantDb: string;
  type: FullType;
  message: string;
  resource?: string;
  resourceId?: string;
  action?: string;
  createdBy?: string;
  recipients?: string[];
  createdAt?: Date;
} {
  return {
    tenantDb: compressed.tn,
    type: TYPE_REVERSE_MAP[compressed.t],
    message: compressed.m,
    resource: compressed.r,
    resourceId: compressed.ri,
    action: compressed.a,
    createdBy: compressed.cb,
    recipients: compressed.rc,
    createdAt: compressed.ts,
  };
}
