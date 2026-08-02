// pos_modules/orders/printing-facility/helpers.ts
// Helper functions to convert Order data to print data structures (KOTData, BillData, DaySummaryData)

import type { KOTData, KOTItem, BillData, BillItem, DaySummaryData } from './types';
import type { Order, OrderItem, PaymentTransaction, OrderStats, AppliedAdjustment } from '@/types/order.types';
import type { ISettings } from '@/types/settings.types';
import { buildReceiptRenderOptions } from './receiptOptions';

// ─────────────────────────────────────────────────────────────────────────────
// KOT Number Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a unique KOT number based on timestamp.
 * Format: Last 6 digits of timestamp
 */
export function generateKOTNumber(): string {
  return String(Date.now()).slice(-6);
}

/**
 * Generates a KOT number with prefix.
 * Format: KOT-XXXXXX
 */
export function generatePrefixedKOTNumber(prefix = 'KOT'): string {
  return `${prefix}-${generateKOTNumber()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order → KOTData Conversion
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateKOTOptions {
  /** Custom KOT number. If not provided, auto-generates one */
  kotNumber?: string;
  /** Table number override */
  tableNumber?: string;
  /** Table section override */
  tableSection?: string;
  /** Whether this is a modification/reprint */
  isModification?: boolean;
  /** Specific items to include (if only printing subset) */
  itemsToInclude?: string[];  // Array of item _id's
  /** Mark as priority/rush */
  isPriority?: boolean;
  /** Kitchen notes to add */
  kitchenNotes?: string;
}

/**
 * Creates KOTData from an Order object.
 */
export function createKOTData(order: Order, options: CreateKOTOptions = {}): KOTData {
  const {
    kotNumber = generateKOTNumber(),
    tableNumber,
    tableSection,
    isModification = false,
    itemsToInclude,
    isPriority,
    kitchenNotes,
  } = options;

  // Filter items if specific ones requested
  let items = order.items || [];
  if (itemsToInclude && itemsToInclude.length > 0) {
    items = items.filter(item => itemsToInclude.includes(item._id));
  }

  // Convert OrderItems to KOTItems
  const kotItems: KOTItem[] = items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    modifiers: item.modifiers?.map(m => ({
      name: m.name,
      price: m.price,
    })),
    specialInstructions: item.specialInstructions,
    // category and station would come from menu item metadata if available
  }));

  return {
    kotNumber,
    orderNumber: order.orderNumber,
    tableNumber: tableNumber || order.table?.tableNumber,
    tableSection: tableSection || order.table?.sectionName,
    orderMode: order.mode,
    guestCount: order.table?.guestCount,
    items: kotItems,
    kitchenNotes: kitchenNotes || order.kitchenNotes,
    priority: isPriority || order.isPriority,
    timestamp: new Date(),
    isModification,
  };
}

/**
 * Creates KOTData from raw items (used when order hasn't been saved yet).
 */
export function createKOTDataFromItems(
  items: Array<{
    name: string;
    quantity: number;
    modifiers?: Array<{ name: string; price?: number }>;
    specialInstructions?: string;
  }>,
  options: {
    kotNumber?: string;
    orderNumber?: string | number;
    tableNumber?: string;
    tableSection?: string;
    orderMode?: string;
    guestCount?: number;
    waiterName?: string;
    kitchenNotes?: string;
    isPriority?: boolean;
  } = {}
): KOTData {
  return {
    kotNumber: options.kotNumber || generateKOTNumber(),
    orderNumber: options.orderNumber || '',
    tableNumber: options.tableNumber,
    tableSection: options.tableSection,
    orderMode: options.orderMode || 'dine_in',
    guestCount: options.guestCount,
    waiterName: options.waiterName,
    items: items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers?.map(m => ({ name: m.name, price: m.price })),
      specialInstructions: item.specialInstructions,
    })),
    kitchenNotes: options.kitchenNotes,
    priority: options.isPriority,
    timestamp: new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Order → BillData Conversion
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateBillOptions {
  /** Invoice/bill number override */
  invoiceNumber?: string;
  /** Show full business address */
  showAddress?: boolean;
  /** Show phone number */
  showPhone?: boolean;
  /** Show tax breakdown */
  showTaxBreakdown?: boolean;
  /** Custom footer text */
  footerText?: string;
  /** Custom header text */
  headerText?: string;
}

/**
 * Creates BillData from an Order and Settings.
 */
export function createBillData(
  order: Order,
  settings: ISettings,
  options: CreateBillOptions = {}
): BillData {
  const { receipt, tax, serviceCharge } = settings;

  // Convert OrderItems to BillItems
  const billItems: BillItem[] = (order.items || []).map((item, index) => ({
    index: index + 1,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    modifiers: item.modifiers?.map(m => ({ name: m.name, price: m.price })),
  }));

  // Build adjustments array from order adjustments
  const adjustments = (order.adjustments || []).map(adj => ({
    name: adj.name,
    amount: adj.computedAmount,
    isDeduction: adj.kind === 'discount',
  }));

  return {
    // Business Info
    businessName: settings.businessName,
    businessAddress: settings.businessAddress ? {
      line1: settings.businessAddress.line1,
      line2: settings.businessAddress.line2,
      city: settings.businessAddress.city,
      postalCode: settings.businessAddress.postalCode,
    } : undefined,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    taxRegistrationNumber: tax?.taxRegistrationNumber,
    logoUrl: settings.logoUrl,

    // Order Info
    invoiceNumber: options.invoiceNumber || String(order.orderNumber),
    orderNumber: order.orderNumber,
    tableNumber: order.table?.tableNumber,
    orderMode: order.mode,
    guestCount: order.table?.guestCount,

    // Customer (if available)
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
    customerAddress: order.customer?.address
      ? `${order.customer.address.line1}${order.customer.address.line2 ? ', ' + order.customer.address.line2 : ''}, ${order.customer.address.city}`
      : undefined,

    // Items
    items: billItems,

    // Totals
    subtotal: order.subtotal,
    taxLabel: tax?.taxLabel || 'Tax',
    taxRate: tax?.taxRate || 0,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount || 0,
    discountLabel: order.discountValue ? `Discount (${order.discountType === 'percentage' ? order.discountValue + '%' : 'Fixed'})` : undefined,
    serviceCharge: order.serviceCharge,
    serviceChargeLabel: serviceCharge?.enabled ? serviceCharge.label : undefined,
    deliveryFee: order.deliveryFee,
    tipAmount: order.tipAmount,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    grandTotal: order.grandTotal,

    // Payment
    payments: order.transactions || [],
    amountPaid: order.amountPaid,
    amountDue: order.amountDue,
    isPaid: order.amountDue <= 0,

    // Meta
    servedBy: typeof order.servedBy === 'object' ? order.servedBy.username : undefined,
    timestamp: new Date(),

    // Customization
    headerText: options.headerText || receipt?.headerText,
    footerText: options.footerText || receipt?.footerText,
    showLogo: receipt?.showLogo ?? false,
    showAddress: options.showAddress ?? receipt?.showAddress ?? true,
    showPhone: options.showPhone ?? receipt?.showPhone ?? true,
    showTaxBreakdown: options.showTaxBreakdown ?? receipt?.showTaxBreakdown ?? true,

    // Full render contract (template, all field toggles, currency, QR). Drives
    // the printed layout and is mirrored by the thermal service.
    renderOptions: buildReceiptRenderOptions(settings),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orders → DaySummaryData Conversion
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDaySummaryOptions {
  /** Report type */
  reportType: 'x_report' | 'z_report' | 'day_summary';
  /** Date for the report (defaults to today) */
  date?: Date;
  /** Cashier/user name generating the report */
  generatedBy: string;
  /** Register/terminal number */
  registerNumber?: string;
  /** Opening cash amount */
  openingCash?: number;
  /** Closing cash amount */
  closingCash?: number;
  /** Include hourly breakdown */
  includeHourlyBreakdown?: boolean;
  /** Include category breakdown */
  includeCategoryBreakdown?: boolean;
  /** Include top selling items */
  includeTopItems?: boolean;
  /** Number of top items to include */
  topItemsCount?: number;
}

/**
 * Creates DaySummaryData from orders array and stats.
 */
export function createDaySummaryData(
  orders: Order[],
  stats: OrderStats | null,
  settings: ISettings,
  options: CreateDaySummaryOptions
): DaySummaryData {
  const {
    reportType,
    date = new Date(),
    generatedBy,
    registerNumber,
    openingCash,
    closingCash,
    includeHourlyBreakdown = true,
    includeCategoryBreakdown = false,
    includeTopItems = true,
    topItemsCount = 10,
  } = options;

  // Filter to completed orders only
  const completedOrders = orders.filter(o => o.status === 'completed' && !o.isVoid);
  const cancelledOrders = orders.filter(o => o.status === 'cancelled' || o.isVoid);

  // Calculate totals
  const grossRevenue = completedOrders.reduce((sum, o) => sum + o.grandTotal, 0);
  const totalDiscounts = completedOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
  const totalTax = completedOrders.reduce((sum, o) => sum + o.taxAmount, 0);
  const totalServiceCharge = completedOrders.reduce((sum, o) => sum + (o.serviceCharge || 0), 0);
  const totalTips = completedOrders.reduce((sum, o) => sum + (o.tipAmount || 0), 0);
  const netRevenue = grossRevenue - totalDiscounts;

  // Payment breakdown
  const paymentMap = new Map<string, { count: number; amount: number }>();
  for (const order of completedOrders) {
    for (const txn of order.transactions || []) {
      const existing = paymentMap.get(txn.method) || { count: 0, amount: 0 };
      existing.count += 1;
      existing.amount += txn.amount;
      paymentMap.set(txn.method, existing);
    }
  }
  const paymentBreakdown = Array.from(paymentMap.entries()).map(([method, data]) => ({
    method: method.charAt(0).toUpperCase() + method.slice(1),
    count: data.count,
    amount: data.amount,
  }));

  // Order mode breakdown
  const modeMap = new Map<string, { count: number; revenue: number }>();
  for (const order of completedOrders) {
    const existing = modeMap.get(order.mode) || { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += order.grandTotal;
    modeMap.set(order.mode, existing);
  }
  const orderModeBreakdown = Array.from(modeMap.entries()).map(([mode, data]) => ({
    mode: mode.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count: data.count,
    revenue: data.revenue,
  }));

  // Hourly breakdown (optional)
  let hourlyBreakdown: { hour: string; orders: number; revenue: number }[] | undefined;
  if (includeHourlyBreakdown) {
    const hourMap = new Map<number, { orders: number; revenue: number }>();
    for (const order of completedOrders) {
      const hour = new Date(order.completedAt || order.createdAt).getHours();
      const existing = hourMap.get(hour) || { orders: 0, revenue: 0 };
      existing.orders += 1;
      existing.revenue += order.grandTotal;
      hourMap.set(hour, existing);
    }
    hourlyBreakdown = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        orders: data.orders,
        revenue: data.revenue,
      }));
  }

  // Top selling items (optional)
  let topSellingItems: { name: string; quantity: number; revenue: number }[] | undefined;
  if (includeTopItems) {
    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    for (const order of completedOrders) {
      for (const item of order.items || []) {
        const existing = itemMap.get(item.name) || { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.subtotal;
        itemMap.set(item.name, existing);
      }
    }
    topSellingItems = Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, topItemsCount);
  }

  // Cash difference calculation
  let cashDifference: number | undefined;
  if (openingCash !== undefined && closingCash !== undefined) {
    const expectedCash = openingCash + (paymentMap.get('cash')?.amount || 0);
    cashDifference = closingCash - expectedCash;
  }

  return {
    businessName: settings.businessName,
    reportType,
    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    reportDate: date,
    generatedAt: new Date(),
    generatedBy,
    registerNumber,

    // Overview
    totalOrders: completedOrders.length + cancelledOrders.length,
    completedOrders: completedOrders.length,
    cancelledOrders: cancelledOrders.length,

    // Revenue
    grossSales: grossRevenue,
    grossRevenue,
    totalDiscounts,
    totalTax,
    totalServiceCharge,
    totalTips,
    netSales: netRevenue,
    netRevenue,

    // Breakdowns
    paymentBreakdown,
    orderModeBreakdown,
    hourlyBreakdown,
    topSellingItems,

    // Cash management
    openingCash,
    closingCash,
    cashDifference,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Print Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick print KOT for an order with minimal options.
 * Returns the KOTData without performing the print.
 */
export function prepareKOTForPrint(
  order: Order,
  tableNumber?: string,
  isPriority = false
): KOTData {
  return createKOTData(order, { tableNumber, isPriority });
}

/**
 * Quick print Bill for an order with minimal options.
 * Returns the BillData without performing the print.
 */
export function prepareBillForPrint(
  order: Order,
  settings: ISettings
): BillData {
  return createBillData(order, settings);
}
