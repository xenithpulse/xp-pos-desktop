// scripts/migrations/0002-init-server-config.mjs
// Initialize ServerConfig collection for Server Management Dashboard

export const id = "0002";
export const description = "Initialize ServerConfig collection";

export async function up(conn) {
  const ServerConfig = conn.collection("server_config");
  
  const existing = await ServerConfig.findOne({});
  if (existing) {
    console.log("[0002] ServerConfig already initialized, skipping");
    return;
  }

  // Create default ServerConfig document
  await ServerConfig.insertOne({
    routerEnabled: true,
    routerMacWhitelist: [],
    routerBlacklistEnabled: false,
    routerBlockUnknownDevices: false,
    
    allowedNetworks: [],
    maxConcurrentConnections: 100,
    sessionTimeoutMinutes: 480,
    
    backupPaths: [],
    backupEnabled: true,
    backupHour: 2,
    backupRetentionDays: 14,
    maxBackupConcurrency: 1,
    
    trackConnections: true,
    activeConnections: [],
    connectionLogRetentionDays: 30,
    
    requireHttps: false,
    enableRateLimiting: true,
    rateLimitPerMinute: 60,
    enableAuditLog: true,
    auditLogRetentionDays: 90,
    
    lastHealthCheck: null,
    systemStatus: "healthy",
    diskUsageThresholdPercent: 80,
    
    integrations: {
      dnsProvider: "cloudflare"
    },
    
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("[0002] ServerConfig initialized with defaults");
}

export async function down(conn) {
  // Optionally drop the collection on rollback
  // const ServerConfig = conn.collection("server_config");
  // await ServerConfig.drop();
  // console.log("[0002] ServerConfig dropped");
}
