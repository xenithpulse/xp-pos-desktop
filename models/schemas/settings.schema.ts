// models/schemas/settings.schema.ts
// Restaurant settings / configuration — singleton document per tenant

import { Schema } from 'mongoose';

// Re-export types & constants from the client-safe types file
export type {
  SupportedCurrency,
  IBusinessAddress,
  IReceiptConfig,
  ITaxConfig,
  IServiceChargeConfig,
  IHubConfig,
  ISettings,
} from '@/types/settings.types';
export { CURRENCY_OPTIONS, DEFAULT_SETTINGS } from '@/types/settings.types';

import type { IBusinessAddress, IReceiptConfig, ITaxConfig, IServiceChargeConfig, IHubConfig, IPaymentMethodConfig, ISettings } from '@/types/settings.types';
import { DEFAULT_SETTINGS } from '@/types/settings.types';

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

const BusinessAddressSchema = new Schema<IBusinessAddress>(
  {
    line1:      { type: String, default: DEFAULT_SETTINGS.businessAddress.line1 },
    line2:      { type: String, default: DEFAULT_SETTINGS.businessAddress.line2 },
    city:       { type: String, default: DEFAULT_SETTINGS.businessAddress.city },
    state:      { type: String, default: DEFAULT_SETTINGS.businessAddress.state },
    postalCode: { type: String, default: DEFAULT_SETTINGS.businessAddress.postalCode },
    country:    { type: String, default: DEFAULT_SETTINGS.businessAddress.country },
  },
  { _id: false },
);

const ReceiptConfigSchema = new Schema<IReceiptConfig>(
  {
    template:          { type: String, enum: ['classic', 'compact', 'elegant', 'minimal'], default: DEFAULT_SETTINGS.receipt.template },
    paperWidth:        { type: String, enum: ['58mm', '80mm'], default: DEFAULT_SETTINGS.receipt.paperWidth },
    printCharWidth:    { type: Number, default: DEFAULT_SETTINGS.receipt.printCharWidth },
    headerText:        { type: String, default: DEFAULT_SETTINGS.receipt.headerText },
    footerText:        { type: String, default: DEFAULT_SETTINGS.receipt.footerText },
    // Header / business identity
    showLogo:          { type: Boolean, default: DEFAULT_SETTINGS.receipt.showLogo },
    showBusinessName:  { type: Boolean, default: DEFAULT_SETTINGS.receipt.showBusinessName },
    showAddress:       { type: Boolean, default: DEFAULT_SETTINGS.receipt.showAddress },
    showPhone:         { type: Boolean, default: DEFAULT_SETTINGS.receipt.showPhone },
    showEmail:         { type: Boolean, default: DEFAULT_SETTINGS.receipt.showEmail },
    showWebsite:       { type: Boolean, default: DEFAULT_SETTINGS.receipt.showWebsite },
    showTaxId:         { type: Boolean, default: DEFAULT_SETTINGS.receipt.showTaxId },
    // Order meta
    showOrderNumber:   { type: Boolean, default: DEFAULT_SETTINGS.receipt.showOrderNumber },
    showDateTime:      { type: Boolean, default: DEFAULT_SETTINGS.receipt.showDateTime },
    showTable:         { type: Boolean, default: DEFAULT_SETTINGS.receipt.showTable },
    showServer:        { type: Boolean, default: DEFAULT_SETTINGS.receipt.showServer },
    showCustomer:      { type: Boolean, default: DEFAULT_SETTINGS.receipt.showCustomer },
    showOrderMode:     { type: Boolean, default: DEFAULT_SETTINGS.receipt.showOrderMode },
    // Items
    showItemModifiers: { type: Boolean, default: DEFAULT_SETTINGS.receipt.showItemModifiers },
    showItemNotes:     { type: Boolean, default: DEFAULT_SETTINGS.receipt.showItemNotes },
    showUnitPrice:     { type: Boolean, default: DEFAULT_SETTINGS.receipt.showUnitPrice },
    // Totals
    showTaxBreakdown:  { type: Boolean, default: DEFAULT_SETTINGS.receipt.showTaxBreakdown },
    showDiscount:      { type: Boolean, default: DEFAULT_SETTINGS.receipt.showDiscount },
    showServiceCharge: { type: Boolean, default: DEFAULT_SETTINGS.receipt.showServiceCharge },
    showTip:           { type: Boolean, default: DEFAULT_SETTINGS.receipt.showTip },
    // Payment
    showPaymentMethod: { type: Boolean, default: DEFAULT_SETTINGS.receipt.showPaymentMethod },
    showAmountPaid:    { type: Boolean, default: DEFAULT_SETTINGS.receipt.showAmountPaid },
    showChange:        { type: Boolean, default: DEFAULT_SETTINGS.receipt.showChange },
    // Footer
    showFooterMessage: { type: Boolean, default: DEFAULT_SETTINGS.receipt.showFooterMessage },
    showThankYou:      { type: Boolean, default: DEFAULT_SETTINGS.receipt.showThankYou },
    showPoweredBy:     { type: Boolean, default: DEFAULT_SETTINGS.receipt.showPoweredBy },
    // QR
    qrEnabled:         { type: Boolean, default: DEFAULT_SETTINGS.receipt.qrEnabled },
    qrContent:         { type: String, enum: ['order_number', 'custom'], default: DEFAULT_SETTINGS.receipt.qrContent },
    qrCustomValue:     { type: String, default: DEFAULT_SETTINGS.receipt.qrCustomValue },
  },
  { _id: false },
);

const TaxConfigSchema = new Schema<ITaxConfig>(
  {
    taxRate:               { type: Number, default: DEFAULT_SETTINGS.tax.taxRate, min: 0, max: 100 },
    taxInclusive:          { type: Boolean, default: DEFAULT_SETTINGS.tax.taxInclusive },
    taxLabel:              { type: String, default: DEFAULT_SETTINGS.tax.taxLabel },
    taxRegistrationNumber: { type: String, default: '' },
  },
  { _id: false },
);

const ServiceChargeConfigSchema = new Schema<IServiceChargeConfig>(
  {
    enabled:    { type: Boolean, default: DEFAULT_SETTINGS.serviceCharge.enabled },
    percentage: { type: Number, default: DEFAULT_SETTINGS.serviceCharge.percentage, min: 0, max: 100 },
    label:      { type: String, default: DEFAULT_SETTINGS.serviceCharge.label },
  },
  { _id: false },
);

const HubConfigSchema = new Schema<IHubConfig>(
  {
    requireCoversOnSeat:  { type: Boolean, default: DEFAULT_SETTINGS.hub.requireCoversOnSeat },
    defaultCovers:        { type: Number, default: DEFAULT_SETTINGS.hub.defaultCovers, min: 1, max: 100 },
    showTableSessionPanel: { type: Boolean, default: DEFAULT_SETTINGS.hub.showTableSessionPanel },
    allowReservations:    { type: Boolean, default: DEFAULT_SETTINGS.hub.allowReservations },
    // Reservation timing policy — see lib/reservations/schedule.ts
    reservationHoldMinutes:        { type: Number, default: DEFAULT_SETTINGS.hub.reservationHoldMinutes, min: 0, max: 720 },
    reservationDurationMinutes:    { type: Number, default: DEFAULT_SETTINGS.hub.reservationDurationMinutes, min: 0, max: 1440 },
    reservationGraceMinutes:       { type: Number, default: DEFAULT_SETTINGS.hub.reservationGraceMinutes, min: 0, max: 240 },
    reservationAutoReleaseMinutes: { type: Number, default: DEFAULT_SETTINGS.hub.reservationAutoReleaseMinutes, min: 0, max: 480 },
    allowWalkInDuringHold:         { type: Boolean, default: DEFAULT_SETTINGS.hub.allowWalkInDuringHold },
    defaultTab:           { type: String, enum: ['floor-plan', 'orders', 'order-editor', 'order-list', 'takeaway'], default: DEFAULT_SETTINGS.hub.defaultTab },
    showFloorPlan:        { type: Boolean, default: DEFAULT_SETTINGS.hub.showFloorPlan },
    showOrders:           { type: Boolean, default: DEFAULT_SETTINGS.hub.showOrders },
    showTakeaway:         { type: Boolean, default: DEFAULT_SETTINGS.hub.showTakeaway },
    showOrderList:        { type: Boolean, default: DEFAULT_SETTINGS.hub.showOrderList },
    autoCloseOnPayment:   { type: Boolean, default: DEFAULT_SETTINGS.hub.autoCloseOnPayment },
    autoPrintKOT:         { type: Boolean, default: DEFAULT_SETTINGS.hub.autoPrintKOT },
  },
  { _id: false },
);

const PaymentMethodConfigSchema = new Schema<IPaymentMethodConfig>(
  {
    id:               { type: String, required: true },
    label:            { type: String, required: true },
    icon:             { type: String },
    category:         { type: String, enum: ['cash', 'card', 'online', 'other'], default: 'other' },
    enabled:          { type: Boolean, default: true },
    requiresReference:{ type: Boolean, default: false },
    sortOrder:        { type: Number, default: 0 },
    isBuiltIn:        { type: Boolean, default: false },
  },
  { _id: false },
);

export const SettingsSchema = new Schema<ISettings>(
  {
    businessName:      { type: String, required: true, default: DEFAULT_SETTINGS.businessName },
    businessNameShort: { type: String, default: DEFAULT_SETTINGS.businessNameShort },
    businessAddress:   { type: BusinessAddressSchema, default: () => ({ ...DEFAULT_SETTINGS.businessAddress }) },
    phone:             { type: String, default: DEFAULT_SETTINGS.phone },
    email:             { type: String, default: DEFAULT_SETTINGS.email },
    website:           { type: String, default: '' },
    logoUrl:           { type: String, default: '' },

    currency:               { type: String, default: DEFAULT_SETTINGS.currency },
    currencySymbol:         { type: String, default: DEFAULT_SETTINGS.currencySymbol },
    currencyLocale:         { type: String, default: DEFAULT_SETTINGS.currencyLocale },
    currencyDecimals:       { type: Number, default: DEFAULT_SETTINGS.currencyDecimals, min: 0, max: 4 },
    currencySymbolPosition: { type: String, enum: ['before', 'after'], default: DEFAULT_SETTINGS.currencySymbolPosition },
    timezone:               { type: String, default: DEFAULT_SETTINGS.timezone },

    tax:           { type: TaxConfigSchema, default: () => ({ ...DEFAULT_SETTINGS.tax }) },
    serviceCharge: { type: ServiceChargeConfigSchema, default: () => ({ ...DEFAULT_SETTINGS.serviceCharge }) },
    receipt:       { type: ReceiptConfigSchema, default: () => ({ ...DEFAULT_SETTINGS.receipt }) },
    hub:           { type: HubConfigSchema, default: () => ({ ...DEFAULT_SETTINGS.hub }) },

    paymentMethods: { type: [PaymentMethodConfigSchema], default: () => DEFAULT_SETTINGS.paymentMethods.map((m) => ({ ...m })) },
    autoConfirmOrders:     { type: Boolean, default: DEFAULT_SETTINGS.autoConfirmOrders },
    defaultOrderMode:      { type: String, default: DEFAULT_SETTINGS.defaultOrderMode },
    kitchenDisplayEnabled: { type: Boolean, default: DEFAULT_SETTINGS.kitchenDisplayEnabled },
  },
  { timestamps: true },
);

