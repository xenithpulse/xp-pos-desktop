# XP-POS Thermal Printing Integration - AI Agent Instructions

## Context

The printing facility at `E:\xp-pos\pos_modules\orders\printing-facility` has been refactored to use ESC/POS thermal printing via a local service called **xp-thermal-service** (running at `http://127.0.0.1:9100`).

The old HTML/browser-based printing (`window.print()`) has been completely removed. All printing now goes through the thermal print service.

## Current Printing Facility Structure

```
pos_modules/orders/printing-facility/
├── index.ts              # Module exports
├── types.ts              # TypeScript types (KOTData, BillData, etc.)
├── ThermalPrintService.ts # Main service + usePrintService() hook
├── ThermalPrintAdapter.ts # HTTP client for xp-thermal-service API
└── README.md             # Documentation
```

## Integration Tasks Required

### 1. Update All Print Imports

Find all files that import from the old printing facility and update them:

**Old imports to find (these will now error):**
```ts
import { printService, PrintService } from '@/pos_modules/orders/printing-facility';
import { usePrinting, useKOTPrinting, useBillPrinting } from '@/pos_modules/orders/printing-facility';
import { generateKOTHTML, generateBillHTML } from '@/pos_modules/orders/printing-facility';
import PrintQueueStatus from '@/pos_modules/orders/printing-facility';
import PrinterSettingsPanel from '@/pos_modules/orders/printing-facility';
```

**New imports:**
```ts
import { usePrintService } from '@/pos_modules/orders/printing-facility';
import { ThermalPrintService, getPrintService } from '@/pos_modules/orders/printing-facility';
import type { KOTData, BillData, PrintResult } from '@/pos_modules/orders/printing-facility';
```

### 2. Replace usePrinting() with usePrintService()

**Before:**
```tsx
const { printKOT, printBill, isPrinting, error } = usePrinting();
```

**After:**
```tsx
const { 
  printKOT, 
  printBill, 
  isPrinting, 
  error, 
  isConnected,  // NEW: check if thermal service is online
  clearError    // NEW: clear error state
} = usePrintService();
```

### 3. Update KOT Printing Calls

**Before (if using order object):**
```tsx
await printKOTFromOrder(order, settings, options);
```

**After (construct KOTData manually):**
```tsx
const kotData: KOTData = {
  kotNumber: generateKOTNumber(),
  orderNumber: order.orderNumber,
  tableNumber: order.tableNumber,
  tableSection: order.section,
  orderMode: order.orderType,
  guestCount: order.guests,
  waiterName: order.server,
  items: order.items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    modifiers: item.modifiers?.map(m => ({ name: m.name, price: m.price })),
    specialInstructions: item.notes,
    category: item.category,
  })),
  kitchenNotes: order.kitchenNotes,
  priority: order.isRush,
  timestamp: new Date(),
};

await printKOT(kotData, { 
  printerId: 'kitchen',  // or use settings.kotPrinter
  copies: 1,
});
```

### 4. Update Bill Printing Calls

**Before:**
```tsx
await printBillFromOrder(order, settings, options);
```

**After:**
```tsx
const billData: BillData = {
  businessName: settings.businessName,
  businessAddress: settings.businessAddress,
  phone: settings.phone,
  taxRegistrationNumber: settings.taxId,
  
  invoiceNumber: order.invoiceNumber,
  orderNumber: order.orderNumber,
  tableNumber: order.tableNumber,
  orderMode: order.orderType,
  
  items: order.items.map((item, i) => ({
    index: i + 1,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    subtotal: item.quantity * item.price,
    modifiers: item.modifiers,
  })),
  
  subtotal: order.subtotal,
  taxLabel: 'GST',
  taxRate: settings.taxRate,
  taxAmount: order.tax,
  discountAmount: order.discount || 0,
  grandTotal: order.total,
  
  payments: order.payments,
  amountPaid: order.amountPaid,
  amountDue: order.amountDue,
  isPaid: order.isPaid,
  
  servedBy: order.server,
  timestamp: new Date(),
  footerText: settings.receiptFooter,
};

await printBill(billData, { 
  printerId: 'receipt',
  openCashDrawer: true,  // Opens cash drawer after print
});
```

### 5. Create Helper Functions (Optional)

To avoid repetitive code, create data transformation helpers:

```ts
// pos_modules/orders/printing-facility/helpers.ts

import type { KOTData, BillData } from './types';
import type { Order } from '@/types/order.types';
import type { ISettings } from '@/types/settings.types';

export function createKOTData(order: Order, kotNumber: string): KOTData {
  return {
    kotNumber,
    orderNumber: order.orderNumber,
    tableNumber: order.tableNumber,
    orderMode: order.orderType,
    guestCount: order.guests,
    waiterName: order.server,
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers?.map(m => ({ name: m.name })),
      specialInstructions: item.notes,
    })),
    timestamp: new Date(),
  };
}

export function createBillData(order: Order, settings: ISettings): BillData {
  return {
    businessName: settings.businessName || '',
    invoiceNumber: order.invoiceNumber,
    orderNumber: order.orderNumber,
    items: order.items.map((item, i) => ({
      index: i + 1,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.price,
      subtotal: item.quantity * item.price,
    })),
    subtotal: order.subtotal,
    taxLabel: 'Tax',
    taxRate: settings.taxRate || 0,
    taxAmount: order.tax,
    discountAmount: order.discount || 0,
    grandTotal: order.total,
    payments: order.payments || [],
    amountPaid: order.amountPaid || 0,
    amountDue: order.amountDue || 0,
    isPaid: order.isPaid,
    timestamp: new Date(),
  };
}
```

### 6. Remove Deleted Components/Files

Delete or update any components that referenced removed files:
- `PrintQueueStatus` - removed (queue is now in xp-thermal-service)
- `PrinterSettingsPanel` - removed (configure via xp-thermal-service API)
- `DaySummaryPanel` - removed
- Any HTML generators (`generateKOTHTML`, `generateBillHTML`)

### 7. Add Connection Status UI

The thermal service may be offline. Add UI feedback:

```tsx
function PrintStatusIndicator() {
  const { isConnected, checkConnection } = usePrintService();
  
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      <span>{isConnected ? 'Printer Online' : 'Printer Offline'}</span>
      {!isConnected && (
        <button onClick={checkConnection} className="text-sm underline">
          Retry
        </button>
      )}
    </div>
  );
}
```

### 8. Handle Print Errors

```tsx
const { printKOT, error, clearError } = usePrintService();

useEffect(() => {
  if (error) {
    toast.error(`Print error: ${error}`);
    clearError();
  }
}, [error, clearError]);

const handlePrint = async () => {
  const result = await printKOT(kotData);
  if (result.success) {
    toast.success('Sent to printer');
  }
  // Error handled by effect above
};
```

### 9. Printer Settings Management

Printers are now managed via xp-thermal-service API. Create a settings panel that calls the API:

```tsx
function PrinterSettings() {
  const { getPrinters, testPrinter, isConnected } = usePrintService();
  const [printers, setPrinters] = useState([]);
  
  useEffect(() => {
    if (isConnected) {
      getPrinters().then(setPrinters);
    }
  }, [isConnected]);
  
  const handleTest = async (printerId: string) => {
    const result = await testPrinter(printerId);
    if (result.success) {
      toast.success('Test print sent');
    } else {
      toast.error(result.error);
    }
  };
  
  return (
    <div>
      {printers.map(p => (
        <div key={p.id}>
          {p.name} - {p.isOnline ? 'Online' : 'Offline'}
          <button onClick={() => handleTest(p.id)}>Test</button>
        </div>
      ))}
    </div>
  );
}
```

## xp-thermal-service API Reference

The thermal service is at `http://127.0.0.1:9100`. Key endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Service health status |
| `/api/printers` | GET | List all printers |
| `/api/printers` | POST | Add a printer |
| `/api/printers/:id` | GET | Get printer details |
| `/api/printers/:id` | DELETE | Remove printer |
| `/api/print` | POST | Submit print job |
| `/api/jobs` | GET | List print jobs |
| `/api/jobs/:id` | GET | Get job status |

### Add Printer Example

```bash
curl -X POST http://127.0.0.1:9100/api/printers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "kitchen",
    "name": "Kitchen Printer",
    "type": "usb",
    "config": {
      "printerName": "EPSON TM-T88V",
      "width": 80
    }
  }'
```

## Files to Search/Update

Run these searches to find code that needs updating:

```bash
# Find all printing facility imports
grep -r "from.*printing-facility" --include="*.ts" --include="*.tsx"

# Find usePrinting hook usage
grep -r "usePrinting" --include="*.ts" --include="*.tsx"

# Find printKOTFromOrder calls
grep -r "printKOTFromOrder" --include="*.ts" --include="*.tsx"

# Find printBillFromOrder calls
grep -r "printBillFromOrder" --include="*.ts" --include="*.tsx"

# Find generateKOTHTML or generateBillHTML
grep -r "generateKOTHTML\|generateBillHTML" --include="*.ts" --include="*.tsx"
```

## Testing Checklist

After integration, verify:

1. [ ] xp-thermal-service starts without errors
2. [ ] POS detects printer connection status
3. [ ] KOT prints to kitchen printer
4. [ ] Bill prints to receipt printer
5. [ ] Cash drawer opens with bill
6. [ ] Multiple copies work
7. [ ] Error messages display when printer offline
8. [ ] Auto-reconnect works when service restarts

## Summary

The printing facility now uses ESC/POS commands via xp-thermal-service instead of HTML/browser printing. The main hook is `usePrintService()` which provides:

- `printKOT(data, options)` - Print kitchen order ticket
- `printBill(data, options)` - Print bill/receipt
- `printDaySummary(data, options)` - Print reports
- `testPrinter(id)` - Test a printer
- `openCashDrawer(id)` - Open cash drawer
- `isConnected` - Service online status
- `isPrinting` - Print in progress
- `error` - Last error message
