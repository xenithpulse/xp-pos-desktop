// types/settings.types.ts
// Pure types & constants for Settings — safe for client-side import
// (no mongoose dependency)

/**
 * ISO 4217 currency code. Kept as an open `string` (not a fixed union) so the
 * POS works in every country with any currency — the picker in Settings offers
 * a curated list (CURRENCY_OPTIONS) but a tenant can store any code + symbol.
 */
export type SupportedCurrency = string;

/** Where the currency symbol sits relative to the amount. */
export type CurrencySymbolPosition = 'before' | 'after';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
  /** BCP-47 locale that drives digit grouping + decimal separators. */
  locale: string;
  /** Minor-unit digits: 0 for JPY/KRW, 2 for most, 3 for KWD/BHD/OMR. */
  decimals: number;
  /** Conventional symbol placement for this currency. */
  position: CurrencySymbolPosition;
}

export interface IBusinessAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

/** The four selectable printed-receipt layouts. */
export type ReceiptTemplateId = 'classic' | 'compact' | 'elegant' | 'minimal';

/** What the optional receipt QR code encodes. */
export type ReceiptQrContent = 'order_number' | 'custom';

export interface IReceiptConfig {
  /** Which of the 4 layouts to print. */
  template: ReceiptTemplateId;
  paperWidth: '58mm' | '80mm';
  /**
   * Optional exact characters-per-line override. Leave 0/undefined to use the
   * paper-size default (58mm→32, 80mm→48). Set it (e.g. 42) when a printer fits
   * a different number of columns, so the preview matches the actual print.
   */
  printCharWidth?: number;

  headerText?: string;
  footerText?: string;

  // ── Field toggles: what prints on the receipt ────────────────────────────
  // Header / business identity
  showLogo: boolean;
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showTaxId: boolean;
  // Order meta
  showOrderNumber: boolean;
  showDateTime: boolean;
  showTable: boolean;
  showServer: boolean;
  showCustomer: boolean;
  showOrderMode: boolean;
  // Items
  showItemModifiers: boolean;
  showItemNotes: boolean;
  showUnitPrice: boolean;
  // Totals
  showTaxBreakdown: boolean;
  showDiscount: boolean;
  showServiceCharge: boolean;
  showTip: boolean;
  // Payment
  showPaymentMethod: boolean;
  showAmountPaid: boolean;
  showChange: boolean;
  // Footer
  showFooterMessage: boolean;
  showThankYou: boolean;
  showPoweredBy: boolean;

  // ── QR code ──────────────────────────────────────────────────────────────
  qrEnabled: boolean;
  qrContent: ReceiptQrContent;
  qrCustomValue?: string;
}

/**
 * Resolved field-visibility map shared by the print payload and the preview.
 * Mirrors IReceiptConfig's `show*` toggles with short keys.
 */
export interface ReceiptRenderFields {
  logo: boolean;
  businessName: boolean;
  address: boolean;
  phone: boolean;
  email: boolean;
  website: boolean;
  taxId: boolean;
  orderNumber: boolean;
  dateTime: boolean;
  table: boolean;
  server: boolean;
  customer: boolean;
  orderMode: boolean;
  itemModifiers: boolean;
  itemNotes: boolean;
  unitPrice: boolean;
  taxBreakdown: boolean;
  discount: boolean;
  serviceCharge: boolean;
  tip: boolean;
  paymentMethod: boolean;
  amountPaid: boolean;
  change: boolean;
  qrCode: boolean;
  footerMessage: boolean;
  thankYou: boolean;
  poweredBy: boolean;
}

/**
 * The single render contract carried in the print payload (`ReceiptPayload.options`)
 * and consumed identically by the thermal service renderer AND the POS preview.
 * MUST stay in sync with the mirror type in xp-thermal-service/src/types/index.ts.
 */
export interface ReceiptRenderOptions {
  template: ReceiptTemplateId;
  /**
   * Characters per line. Derived from paper size (32 for 58mm / 48 for 80mm)
   * unless the tenant sets an explicit override to match their exact printer.
   */
  paperWidth: number;
  currency: { symbol: string; decimals: number; position: CurrencySymbolPosition };
  fields: ReceiptRenderFields;
  /** Present only when a QR code should print. */
  qr?: { content: string };
}

/** Picker metadata for the 4 receipt templates. */
export const RECEIPT_TEMPLATES: { id: ReceiptTemplateId; label: string; description: string }[] = [
  { id: 'classic', label: 'Classic', description: 'Full detail — store block, itemized table with unit prices, complete totals & payment.' },
  { id: 'compact', label: 'Compact', description: 'Dense single-line rows, minimal spacing. Fits more on narrow 58mm paper.' },
  { id: 'elegant', label: 'Elegant', description: 'Spacious & centered with refined headings and a hero total. Fine-dining feel.' },
  { id: 'minimal', label: 'Minimal', description: 'Bare slip — store name, items, total, thank-you. Nothing else.' },
];

/**
 * The coarse category a payment method rolls up to. Persisted numerically on
 * each order transaction (0=cash,1=card,2=online,3=other) for reporting, while
 * the method's own label is stored alongside so custom methods keep their name.
 */
export type PaymentCategory = 'cash' | 'card' | 'online' | 'other';

export interface IPaymentMethodConfig {
  /** Stable slug, e.g. 'cash', 'jazzcash'. Unique within the tenant. */
  id: string;
  /** Display name shown in the POS payment drawer & on receipts. */
  label: string;
  /** Optional emoji/short glyph shown on the drawer button. */
  icon?: string;
  /** Reporting bucket + how the transaction's numeric code is derived. */
  category: PaymentCategory;
  /** Whether this method appears in the POS payment drawer. */
  enabled: boolean;
  /** Prompt for a reference / txn id when selected (e.g. card, transfer). */
  requiresReference: boolean;
  /** Order in the drawer (ascending). */
  sortOrder: number;
  /** Built-in methods can be toggled/renamed but not deleted. */
  isBuiltIn?: boolean;
}

export interface ITaxConfig {
  taxRate: number;
  taxInclusive: boolean;
  taxLabel: string;
  taxRegistrationNumber?: string;
}

export interface IServiceChargeConfig {
  enabled: boolean;
  percentage: number;
  label: string;
}

/**
 * Hub (POS management workspace) behaviour configuration.
 *
 * These toggles let each restaurant tenant customise the seating flow,
 * visible modules, and default behaviours of the management hub.
 */
export interface IHubConfig {
  /** Whether to prompt for guest count before starting a table session.
   *  When false, sessions start immediately with `defaultCovers`. */
  requireCoversOnSeat: boolean;

  /** Default guest count pre-filled in the prompt (or auto-assigned when skipped). */
  defaultCovers: number;

  /** Show the TableSessionPanel slide-over on available table click.
   *  When false, clicking an available table goes straight to Order Editor. */
  showTableSessionPanel: boolean;

  /** Enable the reservation feature on the TableSessionPanel. */
  allowReservations: boolean;

  // ── Reservation timing policy ──────────────────────────────────────────────
  // These decide how much table time a booking actually costs. A reservation
  // does not lock its table the moment it is confirmed — it locks it only once
  // the hold window opens, which is what keeps a 21:00 booking from wasting the
  // whole evening. See lib/reservations/schedule.ts.

  /** Minutes before the booking time that the table stops taking walk-ins. */
  reservationHoldMinutes: number;

  /** Expected sitting length — used for clash detection and overrun warnings. */
  reservationDurationMinutes: number;

  /** Minutes past the booking time before a guest counts as late. */
  reservationGraceMinutes: number;

  /**
   * Minutes past the grace period before an unclaimed booking auto-releases as
   * a no-show and hands the table back. `0` disables auto-release.
   */
  reservationAutoReleaseMinutes: number;

  /** Allow staff to seat a walk-in on a table that is inside a hold window. */
  allowWalkInDuringHold: boolean;

  /** Which tab to open by default when the hub loads. */
  defaultTab: 'floor-plan' | 'orders' | 'order-editor' | 'order-list' | 'takeaway' | 'delivery';

  /** Show the Floor Plan tab in the hub. */
  showFloorPlan: boolean;

  /** Show the Orders grid/list tab in the hub. */
  showOrders: boolean;

  /** Show the Takeaway tab in the hub. */
  showTakeaway: boolean;

  /** Show the Delivery tab in the hub. */
  showDelivery: boolean;

  /** Show the Order List (history) tab in the hub. */
  showOrderList: boolean;

  /** Automatically close the table session when the order is fully paid. */
  autoCloseOnPayment: boolean;

  /** Automatically print KOT when items are fired. */
  autoPrintKOT: boolean;
}

export interface ISettings {
  _id?: any;

  // Business Identity
  businessName: string;
  businessNameShort?: string;
  businessAddress: IBusinessAddress;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;

  // Locale & Currency
  currency: SupportedCurrency;
  currencySymbol: string;
  currencyLocale: string;
  /** Minor-unit digits shown (e.g. 0 for ¥, 2 for $, 3 for KWD). */
  currencyDecimals: number;
  /** Whether the symbol prints before ("$5") or after ("5 kr") the amount. */
  currencySymbolPosition: CurrencySymbolPosition;
  timezone: string;

  // Tax & Service Charge
  tax: ITaxConfig;
  serviceCharge: IServiceChargeConfig;

  // Receipt Printing
  receipt: IReceiptConfig;

  // Hub (POS workspace) configuration
  hub: IHubConfig;

  // Payment methods this tenant accepts (fully configurable — see IPaymentMethodConfig)
  paymentMethods: IPaymentMethodConfig[];

  // Operational
  autoConfirmOrders: boolean;
  defaultOrderMode: string;
  kitchenDisplayEnabled: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency Metadata
// ─────────────────────────────────────────────────────────────────────────────

// Curated world-currency list for the Settings picker. Covers every inhabited
// region's major currency. `decimals` and `position` pre-fill sensible defaults
// on selection; a tenant can still override symbol/locale/decimals/position by
// hand, so any currency not listed here is fully supported too.
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  // South Asia
  { code: 'PKR', symbol: 'Rs.', label: 'Pakistani Rupee',    locale: 'en-PK', decimals: 2, position: 'before' },
  { code: 'INR', symbol: '₹',   label: 'Indian Rupee',       locale: 'en-IN', decimals: 2, position: 'before' },
  { code: 'BDT', symbol: '৳',   label: 'Bangladeshi Taka',   locale: 'bn-BD', decimals: 2, position: 'before' },
  { code: 'LKR', symbol: 'Rs',  label: 'Sri Lankan Rupee',   locale: 'si-LK', decimals: 2, position: 'before' },
  { code: 'NPR', symbol: 'रू',  label: 'Nepalese Rupee',     locale: 'ne-NP', decimals: 2, position: 'before' },
  // Middle East
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham',         locale: 'ar-AE', decimals: 2, position: 'before' },
  { code: 'SAR', symbol: '﷼',  label: 'Saudi Riyal',        locale: 'ar-SA', decimals: 2, position: 'before' },
  { code: 'QAR', symbol: 'ر.ق', label: 'Qatari Riyal',       locale: 'ar-QA', decimals: 2, position: 'before' },
  { code: 'KWD', symbol: 'د.ك', label: 'Kuwaiti Dinar',      locale: 'ar-KW', decimals: 3, position: 'before' },
  { code: 'BHD', symbol: '.د.ب',label: 'Bahraini Dinar',     locale: 'ar-BH', decimals: 3, position: 'before' },
  { code: 'OMR', symbol: 'ر.ع.',label: 'Omani Rial',         locale: 'ar-OM', decimals: 3, position: 'before' },
  { code: 'JOD', symbol: 'د.ا', label: 'Jordanian Dinar',    locale: 'ar-JO', decimals: 3, position: 'before' },
  { code: 'ILS', symbol: '₪',   label: 'Israeli Shekel',     locale: 'he-IL', decimals: 2, position: 'before' },
  { code: 'TRY', symbol: '₺',   label: 'Turkish Lira',       locale: 'tr-TR', decimals: 2, position: 'before' },
  { code: 'EGP', symbol: 'E£',  label: 'Egyptian Pound',     locale: 'ar-EG', decimals: 2, position: 'before' },
  // North America
  { code: 'USD', symbol: '$',   label: 'US Dollar',          locale: 'en-US', decimals: 2, position: 'before' },
  { code: 'CAD', symbol: 'C$',  label: 'Canadian Dollar',    locale: 'en-CA', decimals: 2, position: 'before' },
  { code: 'MXN', symbol: '$',   label: 'Mexican Peso',       locale: 'es-MX', decimals: 2, position: 'before' },
  // Europe
  { code: 'EUR', symbol: '€',   label: 'Euro',               locale: 'de-DE', decimals: 2, position: 'after'  },
  { code: 'GBP', symbol: '£',   label: 'British Pound',      locale: 'en-GB', decimals: 2, position: 'before' },
  { code: 'CHF', symbol: 'CHF', label: 'Swiss Franc',        locale: 'de-CH', decimals: 2, position: 'before' },
  { code: 'SEK', symbol: 'kr',  label: 'Swedish Krona',      locale: 'sv-SE', decimals: 2, position: 'after'  },
  { code: 'NOK', symbol: 'kr',  label: 'Norwegian Krone',    locale: 'nb-NO', decimals: 2, position: 'after'  },
  { code: 'DKK', symbol: 'kr',  label: 'Danish Krone',       locale: 'da-DK', decimals: 2, position: 'after'  },
  { code: 'PLN', symbol: 'zł',  label: 'Polish Złoty',       locale: 'pl-PL', decimals: 2, position: 'after'  },
  { code: 'CZK', symbol: 'Kč',  label: 'Czech Koruna',       locale: 'cs-CZ', decimals: 2, position: 'after'  },
  { code: 'HUF', symbol: 'Ft',  label: 'Hungarian Forint',   locale: 'hu-HU', decimals: 0, position: 'after'  },
  { code: 'RON', symbol: 'lei', label: 'Romanian Leu',       locale: 'ro-RO', decimals: 2, position: 'after'  },
  { code: 'RUB', symbol: '₽',   label: 'Russian Ruble',      locale: 'ru-RU', decimals: 2, position: 'after'  },
  { code: 'UAH', symbol: '₴',   label: 'Ukrainian Hryvnia',  locale: 'uk-UA', decimals: 2, position: 'after'  },
  // Africa
  { code: 'ZAR', symbol: 'R',   label: 'South African Rand', locale: 'en-ZA', decimals: 2, position: 'before' },
  { code: 'NGN', symbol: '₦',   label: 'Nigerian Naira',     locale: 'en-NG', decimals: 2, position: 'before' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan Shilling',    locale: 'en-KE', decimals: 2, position: 'before' },
  { code: 'GHS', symbol: '₵',   label: 'Ghanaian Cedi',      locale: 'en-GH', decimals: 2, position: 'before' },
  { code: 'MAD', symbol: 'د.م.',label: 'Moroccan Dirham',    locale: 'ar-MA', decimals: 2, position: 'before' },
  // Asia-Pacific
  { code: 'CNY', symbol: '¥',   label: 'Chinese Yuan',       locale: 'zh-CN', decimals: 2, position: 'before' },
  { code: 'JPY', symbol: '¥',   label: 'Japanese Yen',       locale: 'ja-JP', decimals: 0, position: 'before' },
  { code: 'KRW', symbol: '₩',   label: 'South Korean Won',   locale: 'ko-KR', decimals: 0, position: 'before' },
  { code: 'HKD', symbol: 'HK$', label: 'Hong Kong Dollar',   locale: 'zh-HK', decimals: 2, position: 'before' },
  { code: 'TWD', symbol: 'NT$', label: 'New Taiwan Dollar',  locale: 'zh-TW', decimals: 2, position: 'before' },
  { code: 'SGD', symbol: 'S$',  label: 'Singapore Dollar',   locale: 'en-SG', decimals: 2, position: 'before' },
  { code: 'MYR', symbol: 'RM',  label: 'Malaysian Ringgit',  locale: 'ms-MY', decimals: 2, position: 'before' },
  { code: 'THB', symbol: '฿',   label: 'Thai Baht',          locale: 'th-TH', decimals: 2, position: 'before' },
  { code: 'IDR', symbol: 'Rp',  label: 'Indonesian Rupiah',  locale: 'id-ID', decimals: 0, position: 'before' },
  { code: 'PHP', symbol: '₱',   label: 'Philippine Peso',    locale: 'en-PH', decimals: 2, position: 'before' },
  { code: 'VND', symbol: '₫',   label: 'Vietnamese Dong',    locale: 'vi-VN', decimals: 0, position: 'after'  },
  { code: 'AUD', symbol: 'A$',  label: 'Australian Dollar',  locale: 'en-AU', decimals: 2, position: 'before' },
  { code: 'NZD', symbol: 'NZ$', label: 'New Zealand Dollar', locale: 'en-NZ', decimals: 2, position: 'before' },
  // Latin America
  { code: 'BRL', symbol: 'R$',  label: 'Brazilian Real',     locale: 'pt-BR', decimals: 2, position: 'before' },
  { code: 'ARS', symbol: '$',   label: 'Argentine Peso',     locale: 'es-AR', decimals: 2, position: 'before' },
  { code: 'CLP', symbol: '$',   label: 'Chilean Peso',       locale: 'es-CL', decimals: 0, position: 'before' },
  { code: 'COP', symbol: '$',   label: 'Colombian Peso',     locale: 'es-CO', decimals: 0, position: 'before' },
  { code: 'PEN', symbol: 'S/',  label: 'Peruvian Sol',       locale: 'es-PE', decimals: 2, position: 'before' },
];

/** Look up a currency's metadata by ISO code (case-insensitive). */
export function getCurrencyOption(code: string): CurrencyOption | undefined {
  return CURRENCY_OPTIONS.find((c) => c.code.toLowerCase() === code.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Default values — Lahore, Pakistan origin
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Omit<ISettings, '_id' | 'createdAt' | 'updatedAt'> = {
  businessName: 'XP Restaurant',
  businessNameShort: 'XP',
  businessAddress: {
    line1: 'Main Boulevard',
    line2: 'Gulberg III',
    city: 'Lahore',
    state: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
  },
  phone: '+92 42 1234567',
  email: 'info@xprestaurant.pk',
  website: '',
  logoUrl: '',

  currency: 'PKR',
  currencySymbol: 'Rs.',
  currencyLocale: 'en-PK',
  currencyDecimals: 2,
  currencySymbolPosition: 'before',
  timezone: 'Asia/Karachi',

  tax: {
    taxRate: 16,
    taxInclusive: true,
    taxLabel: 'GST',
    taxRegistrationNumber: '',
  },
  serviceCharge: {
    enabled: false,
    percentage: 10,
    label: 'Service Charge',
  },

  receipt: {
    template: 'classic',
    paperWidth: '80mm',
    printCharWidth: 0,
    headerText: 'Welcome!',
    footerText: 'Thank you for dining with us!',
    // Header / business identity
    showLogo: false,
    showBusinessName: true,
    showAddress: true,
    showPhone: true,
    showEmail: false,
    showWebsite: false,
    showTaxId: true,
    // Order meta
    showOrderNumber: true,
    showDateTime: true,
    showTable: true,
    showServer: true,
    showCustomer: true,
    showOrderMode: false,
    // Items
    showItemModifiers: true,
    showItemNotes: true,
    showUnitPrice: true,
    // Totals
    showTaxBreakdown: true,
    showDiscount: true,
    showServiceCharge: true,
    showTip: true,
    // Payment
    showPaymentMethod: true,
    showAmountPaid: true,
    showChange: true,
    // Footer
    showFooterMessage: true,
    showThankYou: true,
    showPoweredBy: true,
    // QR
    qrEnabled: false,
    qrContent: 'order_number',
    qrCustomValue: '',
  },

  hub: {
    requireCoversOnSeat: true,
    defaultCovers: 2,
    showTableSessionPanel: true,
    allowReservations: true,
    reservationHoldMinutes: 30,
    reservationDurationMinutes: 90,
    reservationGraceMinutes: 15,
    reservationAutoReleaseMinutes: 30,
    allowWalkInDuringHold: true,
    defaultTab: 'floor-plan',
    showFloorPlan: true,
    showOrders: true,
    showTakeaway: true,
    showDelivery: true,
    showOrderList: true,
    autoCloseOnPayment: false,
    autoPrintKOT: false,
  },

  paymentMethods: [
    { id: 'cash',          label: 'Cash',          icon: '💵', category: 'cash',   enabled: true,  requiresReference: false, sortOrder: 0, isBuiltIn: true },
    { id: 'card',          label: 'Card',          icon: '💳', category: 'card',   enabled: true,  requiresReference: true,  sortOrder: 1, isBuiltIn: true },
    { id: 'bank_transfer', label: 'Bank Transfer', icon: '🏦', category: 'online', enabled: true,  requiresReference: true,  sortOrder: 2, isBuiltIn: true },
    { id: 'other',         label: 'Other',         icon: '•',  category: 'other',  enabled: false, requiresReference: false, sortOrder: 3, isBuiltIn: true },
  ],
  autoConfirmOrders: false,
  defaultOrderMode: 'dine_in',
  kitchenDisplayEnabled: true,
};
