// pos_modules/orders/printing-facility/ThermalPrintAdapter.ts
// Adapter to connect POS printing to xp-thermal-service ESC/POS backend
// Drop-in replacement for window.print() approach

import { 
  KOTData, 
  BillData, 
  DaySummaryData,
  PrinterConfig,
  ThermalPrintOptions,
  PrintResult,
  PrintJob,
  PrintJobStatus,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ThermalServiceConfig {
  baseUrl: string;              // Default: 'http://127.0.0.1:9100'
  timeout: number;              // Request timeout in ms
  retryAttempts: number;        // Retry failed requests
  retryDelay: number;           // Delay between retries in ms
  autoDiscover: boolean;        // Auto-discover service port on connect
  portRangeStart: number;       // First port to probe (default 9100)
  portRangeSize: number;        // How many ports to probe (default 10)
  persistPort: boolean;         // Remember discovered port in localStorage
  aggressiveReconnect: boolean; // Re-discover on every connection failure
}

const STORAGE_KEY_PORT = 'xp_thermal_service_port';
const STORAGE_KEY_APIKEY = 'xp_thermal_service_apikey';

const DEFAULT_CONFIG: ThermalServiceConfig = {
  baseUrl: 'http://127.0.0.1:9100',
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
  autoDiscover: true,
  portRangeStart: 9100,
  portRangeSize: 10,
  persistPort: true,
  aggressiveReconnect: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Service Response Types
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface PrintJobResponse {
  jobId: string;
  status: string;
  createdAt: number;
}

interface PrinterInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  isOnline: boolean;
  totalJobsPrinted: number;
}

interface HealthStatus {
  status: string;
  uptime: number;
  printers: {
    total: number;
    online: number;
    offline: number;
  };
  queue: {
    pending: number;
    processing: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logo rasterization (browser canvas → 1-bit ESC/POS raster)
// ─────────────────────────────────────────────────────────────────────────────

/** Packed 1-bit bitmap for the service's GS v 0 raster command. */
export interface RasterLogo {
  /** base64 of row-major, MSB-first packed bits (1 = black dot). */
  data: string;
  /** dots wide (multiple of 8). */
  width: number;
  /** dots tall. */
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Convert a logo image URL into a monochrome (Floyd–Steinberg dithered) raster
 * sized for the printer. Runs in the browser via <canvas>; returns null on any
 * failure so printing is never blocked by a bad/missing logo.
 */
async function rasterizeLogo(url: string, printerDots: number): Promise<RasterLogo | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = await loadImage(url);
    const srcW = img.naturalWidth || 200;
    const srcH = img.naturalHeight || 100;

    // Target ~70% of printer width, byte-aligned, height capped.
    let w = Math.min(srcW, Math.floor((printerDots * 0.7) / 8) * 8);
    let h = Math.round((srcH / srcW) * w);
    const maxH = 160;
    if (h > maxH) { h = maxH; w = Math.floor(((srcW / srcH) * h) / 8) * 8; }
    w = Math.max(8, w);
    h = Math.max(1, h);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    // Luminance buffer (transparent → white).
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
      gray[i] = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Floyd–Steinberg dither → packed 1-bit rows (1 = black).
    const bytesPerRow = w / 8;
    const out = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldV = gray[idx];
        const newV = oldV < 128 ? 0 : 255;
        const err = oldV - newV;
        if (newV === 0) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        if (x + 1 < w) gray[idx + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) gray[idx + w - 1] += (err * 3) / 16;
          gray[idx + w] += (err * 5) / 16;
          if (x + 1 < w) gray[idx + w + 1] += (err * 1) / 16;
        }
      }
    }

    let bin = '';
    for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
    const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(out).toString('base64');
    return { data: b64, width: w, height: h };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal Print Adapter
// ─────────────────────────────────────────────────────────────────────────────

export class ThermalPrintAdapter {
  private config: ThermalServiceConfig;
  private apiKey: string = '';
  private isOnline: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckPromise: Promise<boolean> | null = null;
  private discovered: boolean = false;
  private discoverPromise: Promise<void> | null = null;
  private consecutiveFailures: number = 0;
  private lastSuccessfulPort: number | null = null;
  
  constructor(config: Partial<ThermalServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Try to restore last known port and API key from localStorage
    if (this.config.persistPort) {
      this.restorePersistedPort();
      this.restorePersistedApiKey();
    }
  }

  /**
   * Restore last known working port from localStorage
   */
  private restorePersistedPort(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PORT);
      if (stored) {
        const port = parseInt(stored, 10);
        if (port >= this.config.portRangeStart && port < this.config.portRangeStart + this.config.portRangeSize) {
          this.lastSuccessfulPort = port;
          this.config.baseUrl = `http://127.0.0.1:${port}`;
          console.log(`[ThermalPrintAdapter] Restored port ${port} from cache`);
        }
      }
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
  }

  private restorePersistedApiKey(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_APIKEY);
      if (stored) {
        this.apiKey = stored;
        console.log('[ThermalPrintAdapter] Restored API key from cache');
      }
    } catch {
      // localStorage not available
    }
  }

  /**
   * Persist discovered port to localStorage
   */
  private persistPort(port: number): void {
    if (!this.config.persistPort) return;
    
    try {
      localStorage.setItem(STORAGE_KEY_PORT, port.toString());
      this.lastSuccessfulPort = port;
    } catch {
      // localStorage not available
    }
  }

  private persistApiKey(key: string): void {
    this.apiKey = key;
    if (!this.config.persistPort) return;
    try {
      if (key) {
        localStorage.setItem(STORAGE_KEY_APIKEY, key);
      } else {
        localStorage.removeItem(STORAGE_KEY_APIKEY);
      }
    } catch {
      // localStorage not available
    }
  }

  /**
   * Force re-discovery of service port (clears cache)
   */
  async forceRediscover(): Promise<void> {
    this.discovered = false;
    this.consecutiveFailures = 0;
    this.apiKey = '';
    
    try {
      localStorage.removeItem(STORAGE_KEY_PORT);
      localStorage.removeItem(STORAGE_KEY_APIKEY);
    } catch {
      // ignore
    }
    
    await this.discoverService();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Port Discovery
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Probe ports to find the running thermal service instance.
   * The service uses smart port switching (tries consecutive ports on EADDRINUSE),
   * so the POS adapter mirrors that by scanning the same range.
   * 
   * Discovery order: cached port first, then scan from portRangeStart.
   */
  private async discoverService(): Promise<void> {
    if (this.discovered) return;
    if (this.discoverPromise) return this.discoverPromise;

    this.discoverPromise = this._doDiscover();
    await this.discoverPromise;
    this.discoverPromise = null;
  }

  private async _doDiscover(): Promise<void> {
    const { portRangeStart, portRangeSize } = this.config;
    
    // Build port list: prioritize last successful port, then scan sequentially
    const portsToTry: number[] = [];
    
    // If we have a cached port, try it first
    if (this.lastSuccessfulPort) {
      portsToTry.push(this.lastSuccessfulPort);
    }
    
    // Add remaining ports in order
    for (let i = 0; i < portRangeSize; i++) {
      const port = portRangeStart + i;
      if (port !== this.lastSuccessfulPort) {
        portsToTry.push(port);
      }
    }

    for (const port of portsToTry) {
      const candidateUrl = `http://127.0.0.1:${port}`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        const res = await fetch(`${candidateUrl}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          this.config.baseUrl = candidateUrl;
          this.discovered = true;
          this.consecutiveFailures = 0;
          this.persistPort(port);
          console.log(`[ThermalPrintAdapter] Service found on port ${port}`);
          
          // Auto-fetch API key from the service
          await this.fetchApiKey();
          return;
        }
      } catch {
        // port not responding, try next
      }
    }
    
    // No port found — keep the configured baseUrl as fallback
    this.discovered = true;
    console.warn('[ThermalPrintAdapter] No service found on any port, using default');
  }

  /**
   * Fetch the API key from the service's localhost-only auth endpoint.
   * The service exposes GET /api/auth/local-token which returns the key
   * but only responds to loopback callers — safe for auto-auth.
   * The key is cached in localStorage so we don't fetch on every page load.
   */
  private async fetchApiKey(): Promise<void> {
    // Skip if we already have a cached key
    if (this.apiKey) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.config.baseUrl}/api/auth/local-token`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const body = await res.json();
        if (body.authRequired && body.apiKey) {
          this.persistApiKey(body.apiKey);
          console.log('[ThermalPrintAdapter] API key auto-acquired from service');
        } else if (!body.authRequired) {
          // Auth is disabled on the service — clear any stale key
          this.persistApiKey('');
          console.log('[ThermalPrintAdapter] Service auth disabled, no key needed');
        }
      }
    } catch {
      console.warn('[ThermalPrintAdapter] Could not fetch API key — will retry on next discovery');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Health & Connection
  // ─────────────────────────────────────────────────────────────────────────

  async checkHealth(): Promise<HealthStatus | null> {
    try {
      const response = await this.fetch<HealthStatus>('/api/health');
      this.isOnline = response.success;
      this.lastHealthCheck = Date.now();
      return response.data || null;
    } catch {
      this.isOnline = false;
      return null;
    }
  }

  async isServiceAvailable(): Promise<boolean> {
    // Cache health check for 5 seconds
    if (Date.now() - this.lastHealthCheck < 5000) {
      return this.isOnline;
    }

    // Prevent concurrent health checks
    if (this.healthCheckPromise) {
      await this.healthCheckPromise;
      return this.isOnline;
    }

    this.healthCheckPromise = this.checkHealth().then(h => !!h);
    await this.healthCheckPromise;
    this.healthCheckPromise = null;
    return this.isOnline;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Printer Management
  // ─────────────────────────────────────────────────────────────────────────

  async getPrinters(): Promise<PrinterInfo[]> {
    const response = await this.fetch<PrinterInfo[]>('/api/printers');
    return response.data || [];
  }

  async getPrinter(id: string): Promise<PrinterInfo | null> {
    const response = await this.fetch<PrinterInfo>(`/api/printers/${id}`);
    return response.data || null;
  }

  async testPrinter(printerId?: string): Promise<PrintResult> {
    const response = await this.fetch<PrintJobResponse>('/api/print', {
      method: 'POST',
      body: JSON.stringify({
        templateType: 'test',
        printerId,
        idempotencyKey: `test_${Date.now()}`,
        priority: 1,
        payload: {
          message: 'Test print from XP-POS',
          timestamp: new Date().toISOString(),
        },
      }),
    });

    return {
      success: response.success,
      jobId: response.data?.jobId,
      error: response.error,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // KOT Printing
  // ─────────────────────────────────────────────────────────────────────────

  async printKOT(data: KOTData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    // Transform POS KOT data to service format
    const kotPayload = this.transformKOTData(data);

    const response = await this.fetch<PrintJobResponse>('/api/print', {
      method: 'POST',
      body: JSON.stringify({
        templateType: 'kot',
        printerId: options.printerId,
        idempotencyKey: options.idempotencyKey || `kot_${data.kotNumber}_${Date.now()}`,
        priority: data.priority ? 3 : (options.priority === 'urgent' ? 3 : options.priority === 'high' ? 2 : 1),
        payload: kotPayload,
      }),
    });

    // Handle copies
    if (response.success && options.copies && options.copies > 1) {
      for (let i = 1; i < options.copies; i++) {
        await this.fetch<PrintJobResponse>('/api/print', {
          method: 'POST',
          body: JSON.stringify({
            templateType: 'kot',
            printerId: options.printerId,
            idempotencyKey: `kot_${data.kotNumber}_${Date.now()}_copy${i}`,
            priority: 1,
            payload: kotPayload,
          }),
        });
      }
    }

    return {
      success: response.success,
      jobId: response.data?.jobId,
      error: response.error,
    };
  }

  private transformKOTData(data: KOTData) {
    return {
      // Required fields (must match KOTPayload format)
      orderNumber: data.orderNumber.toString(),
      orderTime: data.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      
      // Items (must match KOTItem format)
      items: data.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        modifiers: item.modifiers?.map(m => m.name), // string[] not objects
        notes: item.specialInstructions,
        isVoid: false,
      })),
      
      // Optional fields
      tableName: data.tableNumber,
      serverName: data.waiterName,
      notes: data.kitchenNotes,
      isVoid: false,
      isReprint: data.isModification || false,
      category: undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Bill/Invoice Printing
  // ─────────────────────────────────────────────────────────────────────────

  async printBill(data: BillData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    const billPayload = this.transformBillData(data);

    // Rasterize the logo client-side (canvas) when the template enables it.
    // Non-blocking: a missing/broken logo just prints without it.
    if (data.renderOptions?.fields.logo && data.logoUrl) {
      const logo = await rasterizeLogo(data.logoUrl, data.renderOptions.paperWidth === 32 ? 384 : 576);
      if (logo) {
        const bp = billPayload as { header?: Record<string, unknown> };
        bp.header = bp.header || {};
        bp.header.logo = logo;
      }
    }

    const response = await this.fetch<PrintJobResponse>('/api/print', {
      method: 'POST',
      body: JSON.stringify({
        templateType: 'receipt',
        printerId: options.printerId,
        idempotencyKey: options.idempotencyKey || `bill_${data.invoiceNumber}_${Date.now()}`,
        priority: options.priority === 'urgent' ? 3 : options.priority === 'high' ? 2 : 1,
        payload: billPayload,
        metadata: {
          openCashDrawer: options.openCashDrawer,
        },
      }),
    });

    // Handle copies
    if (response.success && options.copies && options.copies > 1) {
      for (let i = 1; i < options.copies; i++) {
        await this.fetch<PrintJobResponse>('/api/print', {
          method: 'POST',
          body: JSON.stringify({
            templateType: 'receipt',
            printerId: options.printerId,
            idempotencyKey: `bill_${data.invoiceNumber}_${Date.now()}_copy${i}`,
            priority: 0, // Lower priority for copies
            payload: billPayload,
          }),
        });
      }
    }

    return {
      success: response.success,
      jobId: response.data?.jobId,
      error: response.error,
    };
  }

  private transformBillData(data: BillData) {
    // Build address array for header
    const storeAddress: string[] = [];
    if (data.businessAddress) {
      if (data.businessAddress.line1) storeAddress.push(data.businessAddress.line1);
      if (data.businessAddress.line2) storeAddress.push(data.businessAddress.line2);
      const cityLine = [data.businessAddress.city, data.businessAddress.postalCode].filter(Boolean).join(' ');
      if (cityLine) storeAddress.push(cityLine);
    }

    // Format payment method string — prefer the custom method label when set.
    // This single joined string is what a one-method order prints; it stays
    // exactly as it was. Split orders print `payments` below instead.
    const paymentMethod = data.payments?.length > 0
      ? data.payments.map(p => (p as { methodLabel?: string }).methodLabel || p.method).join(', ')
      : undefined;

    // Itemised payments, so "20 cash, rest on card" prints as two lines with
    // the tenant's own method names rather than one blurred total.
    const payments = data.payments?.length > 0
      ? data.payments.map(p => ({
          label: (p as { methodLabel?: string }).methodLabel || String(p.method),
          amount: p.amount,
        }))
      : undefined;

    // Resolve the render contract + QR value. For 'order_number' QR content the
    // settings builder leaves content blank (it can't know the order #); fill it
    // in here so both the payload's qrCode and options.qr agree.
    const ro = data.renderOptions;
    let options = ro;
    let qrCode: string | undefined;
    if (ro?.fields.qrCode) {
      const qrValue = ro.qr?.content?.trim() || (data.orderNumber?.toString() ?? '');
      qrCode = qrValue || undefined;
      options = { ...ro, qr: { content: qrValue } };
    }

    return {
      // Required fields
      orderNumber: data.orderNumber?.toString() || data.invoiceNumber,
      orderDate: data.timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
      orderTime: data.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      
      // Items (must match ReceiptItem format)
      items: data.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.subtotal,
        modifiers: item.modifiers?.map(m => m.name), // string[] not objects
        notes: (item as { specialInstructions?: string }).specialInstructions,
      })),
      
      // Totals
      subtotal: data.subtotal,
      tax: data.taxAmount || 0,
      taxRate: data.taxRate,
      discount: data.discountAmount > 0 ? data.discountAmount : undefined,
      discountName: data.discountAmount > 0 ? (data.discountLabel || 'Discount') : undefined,
      serviceCharge: data.serviceCharge && data.serviceCharge > 0 ? data.serviceCharge : undefined,
      serviceChargeName: data.serviceChargeLabel,
      tip: data.tipAmount && data.tipAmount > 0 ? data.tipAmount : undefined,
      // Custom bill adjustments (the "Custom Adjustment" discounts/surcharges) —
      // each renders as its own signed line between subtotal and total.
      adjustments: data.adjustments,
      total: data.grandTotal,
      
      // Payment
      paymentMethod,
      payments,
      amountPaid: data.amountPaid,
      change: data.amountPaid > data.grandTotal ? data.amountPaid - data.grandTotal : 0,
      
      // Optional fields
      customerName: data.customerName,
      tableName: data.tableNumber,
      serverName: data.servedBy,
      
      // Header (must match ReceiptHeader format)
      header: data.businessName ? {
        storeName: data.businessName,
        storeAddress: storeAddress.length > 0 ? storeAddress : undefined,
        storePhone: data.phone,
        storeEmail: data.email,
        taxId: data.taxRegistrationNumber,
      } : undefined,
      
      // Footer (must match ReceiptFooter format)
      footer: data.footerText ? {
        message: [data.footerText],
        thankYouMessage: 'Thank you for your business!',
      } : {
        thankYouMessage: 'Thank you for your business!',
      },

      // QR value (resolved above) — service prints it when options.fields.qrCode.
      qrCode,

      // Full render contract: template + field toggles + currency + QR. The
      // service dispatches on options.template and honors every toggle.
      options,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Day Summary / Reports
  // ─────────────────────────────────────────────────────────────────────────

  async printDaySummary(data: DaySummaryData, options: ThermalPrintOptions = {}): Promise<PrintResult> {
    const summaryPayload = this.transformDaySummaryData(data);

    const response = await this.fetch<PrintJobResponse>('/api/print', {
      method: 'POST',
      body: JSON.stringify({
        templateType: 'invoice', // Use invoice template for reports
        printerId: options.printerId,
        idempotencyKey: options.idempotencyKey || `summary_${data.date}_${Date.now()}`,
        priority: 0,
        payload: summaryPayload,
      }),
    });

    return {
      success: response.success,
      jobId: response.data?.jobId,
      error: response.error,
    };
  }

  private transformDaySummaryData(data: DaySummaryData) {
    return {
      header: {
        businessName: data.businessName,
        title: data.reportType === 'z_report' ? 'Z REPORT' : 'X REPORT',
      },
      date: data.date,
      time: data.time,
      cashierName: data.cashierName,
      registerNumber: data.registerNumber,
      
      // Sales breakdown
      sections: [
        {
          title: 'SALES SUMMARY',
          items: [
            { label: 'Total Orders', value: data.totalOrders.toString() },
            { label: 'Gross Sales', value: `$${data.grossSales.toFixed(2)}` },
            { label: 'Net Sales', value: `$${data.netSales.toFixed(2)}` },
            { label: 'Total Tax', value: `$${data.totalTax.toFixed(2)}` },
          ],
        },
        {
          title: 'PAYMENT METHODS',
          items: (data.paymentBreakdown || []).map((entry) => ({
            label: entry.method,
            value: `$${entry.amount.toFixed(2)}`,
          })),
        },
        ...(data.categoryBreakdown ? [{
          title: 'CATEGORY SALES',
          items: data.categoryBreakdown.map((entry) => ({
            label: entry.category,
            value: `$${entry.revenue.toFixed(2)}`,
          })),
        }] : []),
      ],
      
      // Totals
      grandTotal: data.netSales,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Raw ESC/POS Commands
  // ─────────────────────────────────────────────────────────────────────────

  async printRaw(commands: Uint8Array | number[], options: ThermalPrintOptions = {}): Promise<PrintResult> {
    const base64 = Buffer.from(commands).toString('base64');
    
    const response = await this.fetch<PrintJobResponse>('/api/print', {
      method: 'POST',
      body: JSON.stringify({
        templateType: 'raw',
        printerId: options.printerId,
        idempotencyKey: options.idempotencyKey || `raw_${Date.now()}`,
        priority: 1,
        payload: {
          commands: base64,
        },
      }),
    });

    return {
      success: response.success,
      jobId: response.data?.jobId,
      error: response.error,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Job Status
  // ─────────────────────────────────────────────────────────────────────────

  async getJobStatus(jobId: string): Promise<PrintJob | null> {
    const response = await this.fetch<PrintJob>(`/api/jobs/${jobId}`);
    return response.data || null;
  }

  async waitForJob(jobId: string, timeout = 30000): Promise<PrintJobStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = await this.getJobStatus(jobId);
      
      if (!job) {
        return 'failed';
      }
      
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job.status;
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return 'failed'; // Timeout
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cash Drawer
  // ─────────────────────────────────────────────────────────────────────────

  async openCashDrawer(printerId?: string): Promise<PrintResult> {
    // Use the dedicated cash-drawer endpoint which checks printer capabilities
    // If the printer's config has supportsCashDrawer: false, the service will reject it
    const targetId = printerId || 'default';
    
    try {
      const response = await this.fetch<{ success: boolean; message: string }>(
        `/api/printers/${encodeURIComponent(targetId)}/cash-drawer`,
        {
          method: 'POST',
          body: JSON.stringify({ pin: 2 }),
        }
      );

      return {
        success: response.success,
        jobId: '',
        error: response.error,
      };
    } catch {
      // Fallback for older service versions without the endpoint
      const commands = [0x1B, 0x70, 0x00, 0x19, 0xFA];
      return this.printRaw(commands, { printerId });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP Client
  // ─────────────────────────────────────────────────────────────────────────

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ServiceResponse<T>> {
    if (this.config.autoDiscover) await this.discoverService();

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const url = `${this.config.baseUrl}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
            ...options.headers,
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (!response.ok) {
          // On 401, the API key may have been rotated — clear cached key and refetch
          if (response.status === 401 && this.apiKey) {
            this.apiKey = '';
            try { localStorage.removeItem(STORAGE_KEY_APIKEY); } catch { /* noop */ }
            await this.fetchApiKey();
            // If we got a fresh key, retry this request immediately
            if (this.apiKey) continue;
          }
          // On 500+ errors, the service may have restarted on a different port — re-discover
          if (response.status >= 500 && this.config.autoDiscover) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= 2 || attempt === 0) {
              this.discovered = false;
              await this.discoverService();
            }
          }
          throw new Error(data.error?.message || data.message || `HTTP ${response.status}`);
        }
        
        // Reset failure counter on success
        this.consecutiveFailures = 0;
        return { success: true, data: data.data || data };
        
      } catch (error) {
        lastError = error as Error;
        this.consecutiveFailures++;

        // On network errors, trigger aggressive re-discovery
        if (this.config.aggressiveReconnect && (error as Error).name !== 'AbortError') {
          // Force re-scan ports on connection failures after a few attempts
          if (this.consecutiveFailures >= 2 || attempt > 0) {
            this.discovered = false;
            await this.discoverService();
          }
        }

        // Don't retry on abort or if it's the last attempt
        if (
          (error as Error).name === 'AbortError' ||
          attempt === this.config.retryAttempts
        ) {
          break;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, this.config.retryDelay * Math.pow(2, attempt))
        );
      }
    }
    
    return {
      success: false,
      error: lastError?.message || 'Request failed',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let adapterInstance: ThermalPrintAdapter | null = null;

export function getThermalAdapter(config?: Partial<ThermalServiceConfig>): ThermalPrintAdapter {
  if (!adapterInstance || config) {
    adapterInstance = new ThermalPrintAdapter(config);
  }
  return adapterInstance;
}

export default ThermalPrintAdapter;
