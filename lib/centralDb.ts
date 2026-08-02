// lib/centralDb.ts
// Isolated connection to XP_ERP central database
// COMPLETELY SEPARATE from tenant connections - no conflicts

import mongoose, { Connection } from "mongoose";

const XP_ERP_DB = "XP_ERP";

// Read secret at runtime (not module load) for serverless compatibility
function getXpErpSecret(): string | undefined {
  return process.env.XP_ERP_SECRET;
}

// Separate cached connection for XP_ERP (isolated from tenant connection)
// These variables are module-scoped and NEVER shared with lib/mongoose.ts
let cachedCentralConn: Connection | null = null;
let connectionPromise: Promise<Connection | null> | null = null;

// Track the underlying cluster connection separately for cleanup if needed
let clusterConnection: Connection | null = null;

/**
 * Get isolated connection to XP_ERP database
 * Uses a completely separate mongoose instance to avoid conflicts
 * with the tenant connection in lib/mongoose.ts
 */
export async function getCentralConnection(): Promise<Connection | null> {
  const secret = getXpErpSecret();
  
  // Security: Only allow if XP_ERP_SECRET is configured
  if (!secret) {
    console.warn("[XP_ERP] Central forwarding disabled - XP_ERP_SECRET not set");
    return null;
  }

  // Return cached connection if available and healthy
  if (cachedCentralConn?.readyState === 1) {
    return cachedCentralConn;
  }

  // Connection exists but is no longer healthy (dropped/disconnected)
  // Reset everything so we can reconnect cleanly
  if (cachedCentralConn) {
    console.warn(`[XP_ERP] Stale connection detected (readyState: ${cachedCentralConn.readyState}), reconnecting...`);
    cachedCentralConn = null;
    connectionPromise = null;
    // Attempt to close the dead cluster connection (non-blocking)
    if (clusterConnection) {
      clusterConnection.close().catch(() => {});
      clusterConnection = null;
    }
  }

  // A reconnection is already in progress — wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  const BASE_URI = process.env.MONGODB_URI;
  if (!BASE_URI) {
    console.error("[XP_ERP] MONGODB_URI missing");
    return null;
  }

  connectionPromise = (async () => {
    try {
      // Create a NEW mongoose connection (not using the default mongoose instance)
      // This ensures complete isolation from the tenant connection
      const centralClusterConn = await mongoose.createConnection(BASE_URI, {
        serverSelectionTimeoutMS: 10000, // Shorter timeout for non-critical writes
        socketTimeoutMS: 10000,
        maxPoolSize: 2, // Small pool - lightweight writes only
      }).asPromise();

      // Store cluster connection reference
      clusterConnection = centralClusterConn;

      // Switch to XP_ERP database
      const xpErpConn = centralClusterConn.useDb(XP_ERP_DB, { useCache: true });

      cachedCentralConn = xpErpConn;
      
      // Clear the in-flight promise now that connection is established
      // This allows future stale-detection to work correctly
      connectionPromise = null;
      
      console.log(`[XP_ERP] Central DB connected → ${XP_ERP_DB} (isolated connection)`);
      
      return xpErpConn;
    } catch (err) {
      console.error("[XP_ERP] Failed to connect to central DB:", err);
      // Reset so next call can retry
      connectionPromise = null;
      cachedCentralConn = null;
      clusterConnection = null;
      return null;
    }
  })();

  return connectionPromise;
}

/**
 * Validate XP_ERP secret for write operations
 */
export function validateCentralSecret(providedSecret: string): boolean {
  const secret = getXpErpSecret();
  if (!secret) return false;
  return providedSecret === secret;
}

/**
 * Check if central forwarding is enabled
 */
export function isCentralForwardingEnabled(): boolean {
  return !!getXpErpSecret();
}

/**
 * Debug utility: Get connection info for verification
 * Returns null if not connected, otherwise returns connection details
 */
export function getCentralConnectionInfo(): { 
  db: string; 
  readyState: number; 
  isIsolated: boolean;
} | null {
  if (!cachedCentralConn) return null;
  
  return {
    db: cachedCentralConn.name,
    readyState: cachedCentralConn.readyState,
    // Verify isolation: this should always be true
    isIsolated: clusterConnection !== null && cachedCentralConn !== clusterConnection,
  };
}

/**
 * Cleanup: Close central connection (for graceful shutdown)
 */
export async function closeCentralConnection(): Promise<void> {
  if (clusterConnection) {
    await clusterConnection.close();
    clusterConnection = null;
    cachedCentralConn = null;
    connectionPromise = null;
    console.log("[XP_ERP] Central connection closed");
  }
}
