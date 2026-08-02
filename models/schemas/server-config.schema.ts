import { Document, Schema } from 'mongoose';

/**
 * Server Configuration Schema
 * Manages: Router whitelist, backup paths, active connections, system settings
 */

export interface IRouterWhitelistEntry {
  macAddress: string;
  deviceName: string;
  deviceType: 'laptop' | 'tablet' | 'phone' | 'other';
  addedAt: Date;
  addedBy: string;
  status: 'active' | 'blocked' | 'inactive';
  notes?: string;
}

export interface IActiveConnection {
  _id: string;
  ipAddress: string;
  macAddress?: string;
  deviceName?: string;
  username: string;
  role: string;
  loginTime: Date;
  lastActivityTime: Date;
  userAgent?: string;
  isActive: boolean;
}

export interface IBackupPath {
  path: string;
  type: 'local' | 'external' | 'network';
  status: 'active' | 'inactive' | 'error';
  storageUsed: number; // in bytes
  lastBackupTime?: Date;
  backupRetention: number; // days
  notes?: string;
  lastError?: string;
}

export interface IBackupHistoryEntry {
  at: Date;
  status: 'success' | 'partial' | 'error';
  message: string;
  totalBytes: number;
  pathsOk: number;
  pathsTotal: number;
}

export interface IServerConfig extends Document {
  // Router Management
  routerEnabled: boolean;
  routerMacWhitelist: IRouterWhitelistEntry[];
  routerBlacklistEnabled: boolean;
  routerBlockUnknownDevices: boolean;
  
  // Network Settings
  allowedNetworks: string[]; // CIDR ranges like 192.168.1.0/24
  maxConcurrentConnections: number;
  sessionTimeoutMinutes: number;
  
  // Backup Management
  backupPaths: IBackupPath[];
  backupEnabled: boolean;
  backupHour: number; // 0-23
  backupRetentionDays: number;
  maxBackupConcurrency: number;
  // Backup execution status — written by the XP Thermal Service backup subsystem
  // (the Windows-side executor). The dashboard only reads these.
  backupRunRequestedAt?: Date;   // set when "Run Backup Now" is clicked
  backupRunRequestId?: string;
  lastBackupAt?: Date;
  lastBackupStatus?: 'success' | 'partial' | 'error' | 'never';
  lastBackupMessage?: string;
  backupHistory: IBackupHistoryEntry[];
  
  // Active Connections Tracking
  trackConnections: boolean;
  activeConnections: IActiveConnection[];
  connectionLogRetentionDays: number;
  
  // Security Settings
  requireHttps: boolean;
  enableRateLimiting: boolean;
  rateLimitPerMinute: number;
  enableAuditLog: boolean;
  auditLogRetentionDays: number;
  
  // System Health
  lastHealthCheck?: Date;
  systemStatus: 'healthy' | 'warning' | 'critical';
  diskUsageThresholdPercent: number;
  
  // API Keys for integrations
  integrations: {
    cloudflareToken?: string;
    dnsProvider?: string;
  };
  
  createdAt: Date;
  updatedAt: Date;
  lastModifiedBy?: string;
}

export const ServerConfigSchema: Schema = new Schema(
  {
    // ============ Router Management ============
    routerEnabled: { type: Boolean, default: true },
    routerMacWhitelist: [{
      macAddress: { type: String, required: true },
      deviceName: { type: String, required: true },
      deviceType: { type: String, enum: ['laptop', 'tablet', 'phone', 'other'], default: 'laptop' },
      addedAt: { type: Date, default: Date.now },
      addedBy: { type: String, required: true },
      status: { type: String, enum: ['active', 'blocked', 'inactive'], default: 'active' },
      notes: String,
    }],
    routerBlacklistEnabled: { type: Boolean, default: false },
    routerBlockUnknownDevices: { type: Boolean, default: false },
    
    // ============ Network Settings ============
    allowedNetworks: { type: [String], default: [] },
    maxConcurrentConnections: { type: Number, default: 100 },
    sessionTimeoutMinutes: { type: Number, default: 480 }, // 8 hours
    
    // ============ Backup Management ============
    backupPaths: [{
      path: { type: String, required: true },
      type: { type: String, enum: ['local', 'external', 'network'], default: 'local' },
      status: { type: String, enum: ['active', 'inactive', 'error'], default: 'active' },
      storageUsed: { type: Number, default: 0 }, // bytes
      lastBackupTime: Date,
      backupRetention: { type: Number, default: 14 }, // days
      notes: String,
      lastError: String,
    }],
    backupEnabled: { type: Boolean, default: true },
    backupHour: { type: Number, default: 2, min: 0, max: 23 },
    backupRetentionDays: { type: Number, default: 14 },
    maxBackupConcurrency: { type: Number, default: 1 },
    // ---- Backup execution status (written by the XP Thermal Service) ----
    backupRunRequestedAt: Date,
    backupRunRequestId: String,
    lastBackupAt: Date,
    lastBackupStatus: { type: String, enum: ['success', 'partial', 'error', 'never'], default: 'never' },
    lastBackupMessage: String,
    backupHistory: [{
      at: { type: Date, required: true },
      status: { type: String, enum: ['success', 'partial', 'error'], required: true },
      message: String,
      totalBytes: { type: Number, default: 0 },
      pathsOk: { type: Number, default: 0 },
      pathsTotal: { type: Number, default: 0 },
    }],
    
    // ============ Active Connections ============
    trackConnections: { type: Boolean, default: true },
    activeConnections: [{
      _id: String,
      ipAddress: { type: String, required: true },
      macAddress: String,
      deviceName: String,
      username: { type: String, required: true },
      role: { type: String, required: true },
      loginTime: { type: Date, required: true },
      lastActivityTime: { type: Date, required: true },
      userAgent: String,
      isActive: { type: Boolean, default: true },
    }],
    connectionLogRetentionDays: { type: Number, default: 30 },
    
    // ============ Security Settings ============
    requireHttps: { type: Boolean, default: false },
    enableRateLimiting: { type: Boolean, default: true },
    rateLimitPerMinute: { type: Number, default: 60 },
    enableAuditLog: { type: Boolean, default: true },
    auditLogRetentionDays: { type: Number, default: 90 },
    
    // ============ System Health ============
    lastHealthCheck: Date,
    systemStatus: { type: String, enum: ['healthy', 'warning', 'critical'], default: 'healthy' },
    diskUsageThresholdPercent: { type: Number, default: 80 },
    
    // ============ Integrations ============
    integrations: {
      cloudflareToken: String,
      dnsProvider: { type: String, default: 'cloudflare' },
    },
    
    lastModifiedBy: String,
  },
  { 
    collection: 'server_config',
    timestamps: true,
  }
);

// Ensure only one document exists
ServerConfigSchema.pre('save', async function() {
  if (this.isNew) {
    const existing = await this.model('ServerConfig').findOne();
    if (existing) {
      throw new Error('Only one ServerConfig document allowed');
    }
  }
});
