// pos_modules/orders/printing-facility/ThermalPrintService.ts
// Main print service for ESC/POS thermal printing via xp-thermal-service
// Provides React hooks, event handling, and printer management

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ThermalPrintAdapter, 
  getThermalAdapter, 
  ThermalServiceConfig 
} from './ThermalPrintAdapter';
import {
  KOTData,
  BillData,
  DaySummaryData,
  PrinterConfig,
  PrinterSettings,
  ThermalPrintOptions,
  PrintResult,
  PrintEvent,
  PrintEventListener,
  PrintJob,
  DEFAULT_PRINTER_SETTINGS,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Service Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ThermalPrintServiceConfig extends Partial<ThermalServiceConfig> {
  /** Auto-reconnect on disconnect */
  autoReconnect: boolean;
  /** Reconnect interval in ms */
  reconnectInterval: number;
  /** Health check interval in ms */
  healthCheckInterval: number;
  /** Callback when connection status changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback on print events */
  onPrintEvent?: PrintEventListener;
}

const DEFAULT_SERVICE_CONFIG: ThermalPrintServiceConfig = {
  baseUrl: 'http://127.0.0.1:9100',
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
  autoReconnect: true,
  reconnectInterval: 5000,
  healthCheckInterval: 30000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Thermal Print Service
// ─────────────────────────────────────────────────────────────────────────────

export class ThermalPrintService {
  private static instance: ThermalPrintService | null = null;
  
  private config: ThermalPrintServiceConfig;
  private adapter: ThermalPrintAdapter;
  private connected: boolean = false;
  private initialized: boolean = false;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventListeners: Set<PrintEventListener> = new Set();
  private settings: PrinterSettings = DEFAULT_PRINTER_SETTINGS;
  
  private constructor(config: Partial<ThermalPrintServiceConfig> = {}) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
    this.adapter = getThermalAdapter({
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay,
    });
  }
  
  static getInstance(config?: Partial<ThermalPrintServiceConfig>): ThermalPrintService {
    if (!ThermalPrintService.instance) {
      ThermalPrintService.instance = new ThermalPrintService(config);
    } else if (config) {
      // Update config if provided
      ThermalPrintService.instance.updateConfig(config);
    }
    return ThermalPrintService.instance;
  }
  
  static resetInstance(): void {
    if (ThermalPrintService.instance) {
      ThermalPrintService.instance.destroy();
      ThermalPrintService.instance = null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Initialization & Lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return this.connected;
    }
    
    // Check initial connection
    this.connected = await this.adapter.isServiceAvailable();
    this.initialized = true;
    
    // Notify connection status
    this.config.onConnectionChange?.(this.connected);
    
    // Start health checks
    if (this.config.healthCheckInterval > 0) {
      this.startHealthCheck();
    }
    
    // Start auto-reconnect if disconnected
    if (!this.connected && this.config.autoReconnect) {
      this.scheduleReconnect();
    }
    
    console.log(`[ThermalPrintService] Initialized - Connected: ${this.connected}`);
    return this.connected;
  }
  
  private updateConfig(config: Partial<ThermalPrintServiceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Recreate adapter with new config
    this.adapter = getThermalAdapter({
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
      retryAttempts: this.config.retryAttempts,
      retryDelay: this.config.retryDelay,
    });
  }
  
  destroy(): void {
    this.stopHealthCheck();
    this.cancelReconnect();
    this.eventListeners.clear();
    this.initialized = false;
    this.connected = false;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Health Check & Reconnection
  // ─────────────────────────────────────────────────────────────────────────
  
  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(async () => {
      const wasConnected = this.connected;
      this.connected = await this.adapter.isServiceAvailable();
      
      if (wasConnected !== this.connected) {
        console.log(`[ThermalPrintService] Connection ${this.connected ? 'restored' : 'lost'}`);
        this.config.onConnectionChange?.(this.connected);
        
        if (!this.connected && this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    }, this.config.healthCheckInterval);
  }
  
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      
      console.log('[ThermalPrintService] Attempting reconnect with port re-discovery...');
      
      // Force port re-discovery on reconnect attempt
      await this.adapter.forceRediscover();
      this.connected = await this.adapter.isServiceAvailable();
      
      if (this.connected) {
        console.log('[ThermalPrintService] Reconnected successfully');
        this.config.onConnectionChange?.(true);
      } else if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }, this.config.reconnectInterval);
  }
  
  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Connection Status
  // ─────────────────────────────────────────────────────────────────────────
  
  isConnected(): boolean {
    return this.connected;
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }
  
  async checkConnection(): Promise<boolean> {
    this.connected = await this.adapter.isServiceAvailable();
    return this.connected;
  }
  
  /**
   * Force reconnection with port re-discovery.
   * Use this when connection has been lost and you want to immediately try to reconnect.
   */
  async reconnect(): Promise<boolean> {
    console.log('[ThermalPrintService] Manual reconnect triggered');
    this.cancelReconnect();
    
    await this.adapter.forceRediscover();
    this.connected = await this.adapter.isServiceAvailable();
    
    this.config.onConnectionChange?.(this.connected);
    
    if (!this.connected && this.config.autoReconnect) {
      this.scheduleReconnect();
    }
    
    return this.connected;
  }
  
  /**
   * Get the current service base URL (useful for debugging)
   */
  getServiceUrl(): string {
    return (this.adapter as any).config?.baseUrl || 'http://127.0.0.1:9100';
  }
  
  async getHealth() {
    return this.adapter.checkHealth();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Event Handling
  // ─────────────────────────────────────────────────────────────────────────
  
  addEventListener(listener: PrintEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  
  removeEventListener(listener: PrintEventListener): void {
    this.eventListeners.delete(listener);
  }
  
  private emitEvent(event: PrintEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[ThermalPrintService] Event listener error:', error);
      }
    });
    this.config.onPrintEvent?.(event);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Printer Management
  // ─────────────────────────────────────────────────────────────────────────
  
  async getPrinters() {
    if (!this.connected) {
      await this.checkConnection();
    }
    return this.adapter.getPrinters();
  }
  
  async getPrinter(id: string) {
    return this.adapter.getPrinter(id);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Settings Management
  // ─────────────────────────────────────────────────────────────────────────
  
  getSettings(): PrinterSettings {
    return { ...this.settings };
  }
  
  updateSettings(settings: Partial<PrinterSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }
  
  getDefaultPrinterId(type: 'kot' | 'bill' | 'report'): string | null {
    switch (type) {
      case 'kot': return this.settings.kotPrinter;
      case 'bill': return this.settings.billPrinter;
      case 'report': return this.settings.reportPrinter;
      default: return null;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Print Operations
  // ─────────────────────────────────────────────────────────────────────────
  
  async printKOT(data: KOTData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    if (!this.connected) {
      const isAvailable = await this.checkConnection();
      if (!isAvailable) {
        return { success: false, jobId: '', error: 'Thermal service not available' };
      }
    }
    
    const printerId = options.printerId || this.settings.kotPrinter || undefined;
    const result = await this.adapter.printKOT(data, { ...options, printerId });
    
    this.emitEvent({
      type: result.success ? 'job_queued' : 'job_failed',
      job: result.jobId ? { 
        id: result.jobId, 
        type: 'kot', 
        status: result.success ? 'queued' : 'failed',
        priority: options.priority || 'normal',
        printerId: printerId || null,
        templateId: 'kot',
        data,
        copies: options.copies || 1,
        createdAt: Date.now(),
        retryCount: 0,
        error: result.error,
      } : undefined,
      timestamp: Date.now(),
    });
    
    return result;
  }
  
  async printBill(data: BillData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    if (!this.connected) {
      const isAvailable = await this.checkConnection();
      if (!isAvailable) {
        return { success: false, jobId: '', error: 'Thermal service not available' };
      }
    }
    
    const printerId = options.printerId || this.settings.billPrinter || undefined;
    const result = await this.adapter.printBill(data, { ...options, printerId });
    
    this.emitEvent({
      type: result.success ? 'job_queued' : 'job_failed',
      job: result.jobId ? {
        id: result.jobId,
        type: 'bill',
        status: result.success ? 'queued' : 'failed',
        priority: options.priority || 'normal',
        printerId: printerId || null,
        templateId: 'receipt',
        data,
        copies: options.copies || 1,
        createdAt: Date.now(),
        retryCount: 0,
        error: result.error,
      } : undefined,
      timestamp: Date.now(),
    });
    
    return result;
  }
  
  async printDaySummary(data: DaySummaryData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    if (!this.connected) {
      const isAvailable = await this.checkConnection();
      if (!isAvailable) {
        return { success: false, jobId: '', error: 'Thermal service not available' };
      }
    }
    
    const printerId = options.printerId || this.settings.reportPrinter || undefined;
    const result = await this.adapter.printDaySummary(data, { ...options, printerId });
    
    this.emitEvent({
      type: result.success ? 'job_queued' : 'job_failed',
      job: result.jobId ? {
        id: result.jobId,
        type: data.reportType || 'day_summary',
        status: result.success ? 'queued' : 'failed',
        priority: options.priority || 'low',
        printerId: printerId || null,
        templateId: 'invoice',
        data,
        copies: options.copies || 1,
        createdAt: Date.now(),
        retryCount: 0,
        error: result.error,
      } : undefined,
      timestamp: Date.now(),
    });
    
    return result;
  }
  
  async testPrinter(printerId?: string): Promise<PrintResult> {
    if (!this.connected) {
      const isAvailable = await this.checkConnection();
      if (!isAvailable) {
        return { success: false, jobId: '', error: 'Thermal service not available' };
      }
    }
    
    return this.adapter.testPrinter(printerId);
  }
  
  async openCashDrawer(printerId?: string): Promise<PrintResult> {
    if (!this.connected) {
      const isAvailable = await this.checkConnection();
      if (!isAvailable) {
        return { success: false, jobId: '', error: 'Thermal service not available' };
      }
    }
    
    const targetPrinter = printerId || this.settings.billPrinter || undefined;
    return this.adapter.openCashDrawer(targetPrinter);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Job Status
  // ─────────────────────────────────────────────────────────────────────────
  
  async getJobStatus(jobId: string) {
    return this.adapter.getJobStatus(jobId);
  }
  
  async waitForJob(jobId: string, timeout?: number) {
    return this.adapter.waitForJob(jobId, timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React Hook: usePrintService
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePrintServiceOptions {
  /** Service configuration */
  config?: Partial<ThermalPrintServiceConfig>;
  /** Auto-initialize on mount */
  autoInit?: boolean;
}

export interface UsePrintServiceReturn {
  /** Whether service is connected to xp-thermal-service */
  isConnected: boolean;
  /** Whether service is initialized */
  isInitialized: boolean;
  /** Current print operation in progress */
  isPrinting: boolean;
  /** Last error message */
  error: string | null;
  
  /** Print a Kitchen Order Ticket */
  printKOT: (data: KOTData, options?: ThermalPrintOptions) => Promise<PrintResult>;
  /** Print a Bill/Invoice */
  printBill: (data: BillData, options?: ThermalPrintOptions) => Promise<PrintResult>;
  /** Print a Day Summary Report */
  printDaySummary: (data: DaySummaryData, options?: ThermalPrintOptions) => Promise<PrintResult>;
  /** Test print to a printer */
  testPrinter: (printerId?: string) => Promise<PrintResult>;
  /** Open cash drawer */
  openCashDrawer: (printerId?: string) => Promise<PrintResult>;
  
  /** Get available printers */
  getPrinters: () => Promise<unknown[]>;
  /** Get service health */
  getHealth: () => Promise<unknown>;
  /** Manually check connection */
  checkConnection: () => Promise<boolean>;
  
  /** Clear error state */
  clearError: () => void;
  /** Re-initialize the service */
  reinitialize: () => Promise<void>;
}

export function usePrintService(options: UsePrintServiceOptions = {}): UsePrintServiceReturn {
  const { config, autoInit = true } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<ThermalPrintService | null>(null);
  
  // Get service instance
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = ThermalPrintService.getInstance({
        ...config,
        onConnectionChange: (connected) => {
          setIsConnected(connected);
        },
      });
    }
    return serviceRef.current;
  }, [config]);
  
  // Initialize on mount
  useEffect(() => {
    if (!autoInit) return;
    
    let mounted = true;
    
    const init = async () => {
      const service = getService();
      const connected = await service.initialize();
      
      if (mounted) {
        setIsConnected(connected);
        setIsInitialized(true);
      }
    };
    
    init();
    
    return () => {
      mounted = false;
    };
  }, [autoInit, getService]);
  
  // Wrap print functions with loading/error state
  const wrapPrintFn = useCallback(<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R> => {
      setIsPrinting(true);
      setError(null);
      
      try {
        const result = await fn(...args);
        if (typeof result === 'object' && result !== null && 'success' in result) {
          const printResult = result as unknown as PrintResult;
          if (!printResult.success && printResult.error) {
            setError(printResult.error);
          }
        }
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Print operation failed';
        setError(message);
        throw e;
      } finally {
        setIsPrinting(false);
      }
    };
  }, []);
  
  // Create wrapped print functions
  const printKOT = useCallback(
    wrapPrintFn((data: KOTData, options?: ThermalPrintOptions) => 
      getService().printKOT(data, options)
    ),
    [wrapPrintFn, getService]
  );
  
  const printBill = useCallback(
    wrapPrintFn((data: BillData, options?: ThermalPrintOptions) => 
      getService().printBill(data, options)
    ),
    [wrapPrintFn, getService]
  );
  
  const printDaySummary = useCallback(
    wrapPrintFn((data: DaySummaryData, options?: ThermalPrintOptions) => 
      getService().printDaySummary(data, options)
    ),
    [wrapPrintFn, getService]
  );
  
  const testPrinter = useCallback(
    wrapPrintFn((printerId?: string) => 
      getService().testPrinter(printerId)
    ),
    [wrapPrintFn, getService]
  );
  
  const openCashDrawer = useCallback(
    wrapPrintFn((printerId?: string) => 
      getService().openCashDrawer(printerId)
    ),
    [wrapPrintFn, getService]
  );
  
  // Non-print operations
  const getPrinters = useCallback(() => 
    getService().getPrinters()
  , [getService]);
  
  const getHealth = useCallback(() => 
    getService().getHealth()
  , [getService]);
  
  const checkConnection = useCallback(async () => {
    const connected = await getService().checkConnection();
    setIsConnected(connected);
    return connected;
  }, [getService]);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  const reinitialize = useCallback(async () => {
    ThermalPrintService.resetInstance();
    serviceRef.current = null;
    setIsInitialized(false);
    setIsConnected(false);
    
    const service = getService();
    const connected = await service.initialize();
    setIsConnected(connected);
    setIsInitialized(true);
  }, [getService]);
  
  return {
    isConnected,
    isInitialized,
    isPrinting,
    error,
    printKOT,
    printBill,
    printDaySummary,
    testPrinter,
    openCashDrawer,
    getPrinters,
    getHealth,
    checkConnection,
    clearError,
    reinitialize,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ─────────────────────────────────────────────────────────────────────────────

export function getPrintService(config?: Partial<ThermalPrintServiceConfig>): ThermalPrintService {
  return ThermalPrintService.getInstance(config);
}

export default ThermalPrintService;
