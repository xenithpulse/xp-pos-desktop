// pos_modules/orders/index.ts

export { default as OrderManagerGrid } from './KDS/OrderManagerGrid';
export { default as OrderManagerList } from './KDS/OrderManagerList';
export { default as OrderCard } from './KDS/OrderCard';
export { default as OrderDetailsPanel } from './OrderDetailsPanel';
export { OrderEditor } from './order-editor';
export type { OrderEditorHandle } from './order-editor';
export { flushOrderEditorCache } from './order-editor';
export { default as OrderList } from './List_History/OrderList';

// ─────────────────────────────────────────────────────────────────────────────
// Printing Facility - Thermal Printer Support
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Core service now Updated See?
  getPrintService,
  usePrintService,
  
  // Data conversion helpers
  generateKOTNumber,
  createKOTData,
  createKOTDataFromItems,
  createBillData,
  prepareBillForPrint,
  prepareKOTForPrint,
  createDaySummaryData,
  generatePrefixedKOTNumber,
  
  // Low-level adapter
  ThermalPrintService,
  ThermalPrintAdapter,
  getThermalAdapter,
  
  // UI Components
  ThermalPrinterStatus,
  ThermalPrinterStatusCompact,
  PrinterSettingsPanel,
  DaySummaryPanel,
  
  // Constants
  DEFAULT_PRINTER_CONFIG,
  DEFAULT_PRINTER_SETTINGS,
  CHAR_PER_LINE,
  
  // Types
  type PrinterConfig,
  type PrinterSettings,
  type PrintJob,
  type KOTData,
  type BillData,
  type DaySummaryData,
  type ThermalPrintOptions,
  type PrintResult,
} from './printing-facility';
