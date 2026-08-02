// pos_modules/orders/printing-facility/index.ts
// ESC/POS Thermal Printing Facility - Connects to xp-thermal-service
// Provides KOT, Bill, Day Summary printing via thermal printers

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  PrinterType,
  PaperWidth,
  PrinterConnectionType,
  PrinterConfig,
  PrinterSettings,
  PrintJobType,
  PrintJobStatus,
  PrintJobPriority,
  PrintJob,
  KOTItem,
  KOTData,
  BillItem,
  BillData,
  DaySummaryData,
  PrintEvent,
  PrintEventListener,
  PrintResult,
  ThermalPrintOptions,
} from './types';

export {
  DEFAULT_PRINTER_CONFIG,
  DEFAULT_PRINTER_SETTINGS,
  CHAR_PER_LINE,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Thermal Print Service (Main)
// ─────────────────────────────────────────────────────────────────────────────

export {
  ThermalPrintService,
  getPrintService,
  usePrintService,
  type ThermalPrintServiceConfig,
  type UsePrintServiceOptions,
  type UsePrintServiceReturn,
} from './ThermalPrintService';

// ─────────────────────────────────────────────────────────────────────────────
// Thermal Print Adapter (Low-level API client)
// ─────────────────────────────────────────────────────────────────────────────

export {
  ThermalPrintAdapter,
  getThermalAdapter,
  type ThermalServiceConfig,
} from './ThermalPrintAdapter';

// ─────────────────────────────────────────────────────────────────────────────
// Data Conversion Helpers
// ─────────────────────────────────────────────────────────────────────────────

export {
  // KOT helpers
  generateKOTNumber,
  generatePrefixedKOTNumber,
  createKOTData,
  createKOTDataFromItems,
  prepareKOTForPrint,
  
  // Bill helpers
  createBillData,
  prepareBillForPrint,
  
  // Day Summary helpers
  createDaySummaryData,
  
  // Option types
  type CreateKOTOptions,
  type CreateBillOptions,
  type CreateDaySummaryOptions,
} from './helpers';

// ─────────────────────────────────────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────────────────────────────────────

export {
  default as ThermalPrinterStatus,
  ThermalPrinterStatusCompact,
} from './ThermalPrinterStatus';

export { default as DaySummaryPanel } from './DaySummaryPanel';

export { default as PrinterSettingsPanel } from './PrinterSettingsPanel';

export { default as ReceiptPreview } from './ReceiptPreview';

// ─────────────────────────────────────────────────────────────────────────────
// Receipt render contract + shared layout engine
// ─────────────────────────────────────────────────────────────────────────────

export { buildReceiptRenderOptions } from './receiptOptions';
export {
  renderReceipt,
  type ReceiptLayoutData,
  type ReceiptLayoutItem,
  type StyledLine,
} from './receiptLayout';

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

import { ThermalPrintService, getPrintService, usePrintService } from './ThermalPrintService';
import { ThermalPrintAdapter, getThermalAdapter } from './ThermalPrintAdapter';
import {
  generateKOTNumber,
  createKOTData,
  createKOTDataFromItems,
  createBillData,
  createDaySummaryData,
  prepareKOTForPrint,
  prepareBillForPrint,
} from './helpers';

export default {
  // Service class
  ThermalPrintService,
  ThermalPrintAdapter,
  
  // Singleton getters
  getPrintService,
  getThermalAdapter,
  
  // React hook
  usePrintService,
  
  // Data conversion helpers
  generateKOTNumber,
  createKOTData,
  createKOTDataFromItems,
  createBillData,
  createDaySummaryData,
  prepareKOTForPrint,
  prepareBillForPrint,
};
