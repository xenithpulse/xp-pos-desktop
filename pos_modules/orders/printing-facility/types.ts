// pos_modules/orders/printing-facility/types.ts
// Type definitions for ESC/POS thermal printing via xp-thermal-service

import { Order, OrderItem, PaymentTransaction } from '@/types/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Printer Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

export type PrinterType = 'kot' | 'bill' | 'report' | 'multi';

export type PaperWidth = '58mm' | '80mm';

export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth' | 'serial';

export interface PrinterConfig {
  id: string;
  name: string;
  type: PrinterType;
  connectionType: PrinterConnectionType;
  isDefault: boolean;
  enabled: boolean;
  paperWidth: PaperWidth;
  
  // Connection details
  address?: string;        // IP for network, COM port for serial
  port?: number;           // TCP port for network printers
  deviceId?: string;       // USB device ID or Bluetooth address
  
  // Behavior
  autoCut: boolean;
  openCashDrawer: boolean; // For bill printers
  copies: number;          // Default copies to print
  
  // Kitchen-specific (for KOT printers)
  stations?: string[];     // Kitchen stations this printer serves
  categories?: string[];   // Menu categories routed to this printer
  
  // Appearance
  charPerLine: number;     // Characters per line (32 for 58mm, 48 for 80mm)
  fontSize: 'small' | 'normal' | 'large';
}

export interface PrinterSettings {
  kotPrinter: string | null;        // ID of default KOT printer
  billPrinter: string | null;       // ID of default bill/invoice printer
  reportPrinter: string | null;     // ID of default report printer
  printers: PrinterConfig[];
  
  // Global settings
  enableSoundOnPrint: boolean;
  printKOTOnConfirm: boolean;       // Auto-print KOT when order confirmed
  printBillOnComplete: boolean;     // Auto-print bill when order completed
  printDuplicateKOT: boolean;       // Print duplicate KOT for different stations
  
  // Retry settings for reliability
  maxRetries: number;
  retryDelayMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Print Job Types
// ─────────────────────────────────────────────────────────────────────────────

export type PrintJobType = 'kot' | 'bill' | 'day_summary' | 'x_report' | 'z_report' | 'custom';

export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled';

export type PrintJobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PrintJob {
  id: string;
  type: PrintJobType;
  priority: PrintJobPriority;
  status: PrintJobStatus;
  printerId: string | null;
  templateId: string;         // Template for ESC/POS rendering
  data: Record<string, any>;  // Data to pass to template
  copies: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  metadata?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// KOT (Kitchen Order Ticket) Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KOTItem {
  name: string;
  quantity: number;
  modifiers?: { name: string; price?: number }[];
  specialInstructions?: string;
  category?: string;
  station?: string;
}

export interface KOTData {
  kotNumber: string;
  orderNumber: string | number;
  tableNumber?: string;
  tableSection?: string;
  orderMode: string;
  guestCount?: number;
  waiterName?: string;
  items: KOTItem[];
  kitchenNotes?: string;
  priority?: boolean;
  timestamp: Date;
  
  // For modification KOTs
  isModification?: boolean;
  addedItems?: KOTItem[];
  cancelledItems?: KOTItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill/Invoice Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BillItem {
  index: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  modifiers?: { name: string; price: number }[];
}

export interface BillData {
  // Business Info
  businessName: string;
  businessAddress?: {
    line1: string;
    line2?: string;
    city: string;
    postalCode?: string;
  };
  phone?: string;
  email?: string;
  website?: string;
  taxRegistrationNumber?: string;
  logoUrl?: string;
  
  // Order Info
  invoiceNumber: string;
  orderNumber: string | number;
  tableNumber?: string;
  orderMode: string;
  guestCount?: number;
  
  // Customer
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  
  // Items
  items: BillItem[];
  
  // Totals
  subtotal: number;
  taxLabel: string;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  discountLabel?: string;
  serviceCharge?: number;
  serviceChargeLabel?: string;
  deliveryFee?: number;
  tipAmount?: number;
  adjustments?: { name: string; amount: number; isDeduction: boolean }[];
  grandTotal: number;
  
  // Payment
  payments: PaymentTransaction[];
  amountPaid: number;
  amountDue: number;
  isPaid: boolean;
  
  // Meta
  servedBy?: string;
  timestamp: Date;
  
  // Customization
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  showTaxBreakdown?: boolean;

  /**
   * Full receipt render contract (template + field toggles + currency + QR),
   * built from tenant settings via buildReceiptRenderOptions(). When present it
   * drives the printed layout; the thermal service mirrors it exactly.
   */
  renderOptions?: import('@/types/settings.types').ReceiptRenderOptions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Day Summary / Report Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DaySummaryData {
  businessName: string;
  reportType: 'x_report' | 'z_report' | 'day_summary';
  date: string;                // Report date string
  time: string;                // Report time string
  reportDate: Date;
  generatedAt: Date;
  generatedBy: string;
  cashierName?: string;
  registerNumber?: string;
  
  // Overview
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  
  // Revenue
  grossSales: number;          // Alias for grossRevenue
  grossRevenue: number;
  totalDiscounts: number;
  totalTax: number;
  totalServiceCharge: number;
  totalTips: number;
  netSales: number;            // Alias for netRevenue
  netRevenue: number;
  
  // Payment breakdown
  paymentBreakdown: {
    method: string;
    count: number;
    amount: number;
  }[];
  
  // Order mode breakdown
  orderModeBreakdown: {
    mode: string;
    count: number;
    revenue: number;
  }[];
  
  // Category breakdown (optional)
  categoryBreakdown?: {
    category: string;
    itemsSold: number;
    revenue: number;
  }[];
  
  // Top items (optional)
  topSellingItems?: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
  
  // Hourly breakdown (optional)
  hourlyBreakdown?: {
    hour: string;
    orders: number;
    revenue: number;
  }[];
  
  // Cash management
  openingCash?: number;
  closingCash?: number;
  cashDifference?: number;
  
  // Staff performance (optional)
  staffPerformance?: {
    name: string;
    ordersServed: number;
    revenue: number;
  }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Print Service Events
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintEvent {
  type: 'job_queued' | 'job_started' | 'job_completed' | 'job_failed' | 'queue_cleared';
  job?: PrintJob;
  timestamp: number;
}

export type PrintEventListener = (event: PrintEvent) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Utility Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export interface ThermalPrintOptions {
  printerId?: string;
  copies?: number;
  priority?: PrintJobPriority;
  idempotencyKey?: string;   // Prevent duplicate prints
  openCashDrawer?: boolean;  // Open cash drawer after print
  cutPaper?: boolean;        // Auto-cut paper after print
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Configurations
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PRINTER_CONFIG: Omit<PrinterConfig, 'id' | 'name'> = {
  type: 'multi',
  connectionType: 'usb',
  isDefault: false,
  enabled: true,
  paperWidth: '80mm',
  autoCut: true,
  openCashDrawer: false,
  copies: 1,
  charPerLine: 48,
  fontSize: 'normal',
};

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  kotPrinter: null,
  billPrinter: null,
  reportPrinter: null,
  printers: [],
  enableSoundOnPrint: true,
  printKOTOnConfirm: false,
  printBillOnComplete: false,
  printDuplicateKOT: false,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export const CHAR_PER_LINE: Record<PaperWidth, number> = {
  '58mm': 32,
  '80mm': 48,
};
