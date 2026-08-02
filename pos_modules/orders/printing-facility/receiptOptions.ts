// pos_modules/orders/printing-facility/receiptOptions.ts
// Builds the ReceiptRenderOptions contract from tenant settings. Used by BOTH
// the print adapter (to send in the payload) and the live preview (to render),
// so the two can never diverge.

import type { ISettings, ReceiptRenderOptions } from '@/types/settings.types';

export function buildReceiptRenderOptions(settings: ISettings): ReceiptRenderOptions {
  const r = settings.receipt;

  const qrValue =
    r.qrContent === 'custom' ? (r.qrCustomValue?.trim() || undefined) : undefined;

  // Exact override wins; otherwise derive a CONSERVATIVE width from paper size.
  // The 80mm auto is 40 (not the theoretical 48): most generic thermal printers
  // fit ~40 columns and overflow at 48 (divider/items wrap to a second line).
  // "Always fits" beats "full width but wraps" — tenants with a wider printer
  // raise the Chars/line override (e.g. 46–48); narrower ones lower it.
  const charWidth = r.printCharWidth && r.printCharWidth >= 16 ? r.printCharWidth : (r.paperWidth === '58mm' ? 32 : 40);

  return {
    template: r.template,
    paperWidth: charWidth,
    currency: {
      symbol: settings.currencySymbol || 'Rs.',
      decimals: typeof settings.currencyDecimals === 'number' ? settings.currencyDecimals : 2,
      position: settings.currencySymbolPosition === 'after' ? 'after' : 'before',
    },
    fields: {
      logo: r.showLogo,
      businessName: r.showBusinessName,
      address: r.showAddress,
      phone: r.showPhone,
      email: r.showEmail,
      website: r.showWebsite,
      taxId: r.showTaxId,
      orderNumber: r.showOrderNumber,
      dateTime: r.showDateTime,
      table: r.showTable,
      server: r.showServer,
      customer: r.showCustomer,
      orderMode: r.showOrderMode,
      itemModifiers: r.showItemModifiers,
      itemNotes: r.showItemNotes,
      unitPrice: r.showUnitPrice,
      taxBreakdown: r.showTaxBreakdown,
      discount: r.showDiscount,
      serviceCharge: r.showServiceCharge,
      tip: r.showTip,
      paymentMethod: r.showPaymentMethod,
      amountPaid: r.showAmountPaid,
      change: r.showChange,
      qrCode: r.qrEnabled,
      footerMessage: r.showFooterMessage,
      thankYou: r.showThankYou,
      poweredBy: r.showPoweredBy,
    },
    // `content` here is only the *custom* value; the adapter fills in the order
    // number at print time when qrContent === 'order_number'.
    qr: r.qrEnabled ? { content: qrValue ?? '' } : undefined,
  };
}
