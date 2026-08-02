# Thermal Printing Facility

ESC/POS thermal printing module for XP-POS. Connects to **xp-thermal-service** for reliable receipt/KOT printing.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Module exports |
| `types.ts` | TypeScript type definitions |
| `ThermalPrintService.ts` | Main service with React hooks |
| `ThermalPrintAdapter.ts` | HTTP client for xp-thermal-service API |

## Requirements

- **xp-thermal-service** running on `http://127.0.0.1:9100`
- Thermal printers configured in the service

## Quick Start

### 1. Start xp-thermal-service

```bash
cd E:\xp-thermal-service
npm start
```

### 2. Use in Components

```tsx
import { usePrintService } from '@/pos_modules/orders/printing-facility';

function OrderActions({ order }) {
  const { printKOT, printBill, isConnected, isPrinting, error } = usePrintService();
  
  const handlePrintKOT = async () => {
    const kotData = {
      kotNumber: 'KOT-001',
      orderNumber: order.orderNumber,
      tableNumber: order.tableNumber,
      orderMode: order.orderMode,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        modifiers: item.modifiers,
        specialInstructions: item.notes,
      })),
      timestamp: new Date(),
    };
    
    const result = await printKOT(kotData, { printerId: 'kitchen' });
    if (!result.success) {
      console.error('Print failed:', result.error);
    }
  };
  
  return (
    <div>
      <span>Printer: {isConnected ? '🟢 Connected' : '🔴 Offline'}</span>
      <button onClick={handlePrintKOT} disabled={isPrinting || !isConnected}>
        Print KOT
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

## API Reference

### usePrintService Hook

```ts
const {
  // Status
  isConnected,      // boolean - thermal service online
  isInitialized,    // boolean - hook initialized
  isPrinting,       // boolean - print in progress
  error,            // string | null - last error

  // Print functions
  printKOT,         // (data: KOTData, options?) => Promise<PrintResult>
  printBill,        // (data: BillData, options?) => Promise<PrintResult>
  printDaySummary,  // (data: DaySummaryData, options?) => Promise<PrintResult>
  testPrinter,      // (printerId?) => Promise<PrintResult>
  openCashDrawer,   // (printerId?) => Promise<PrintResult>

  // Utility
  getPrinters,      // () => Promise<PrinterInfo[]>
  getHealth,        // () => Promise<HealthStatus>
  checkConnection,  // () => Promise<boolean>
  clearError,       // () => void
  reinitialize,     // () => Promise<void>
} = usePrintService();
```

### Print Options

```ts
interface ThermalPrintOptions {
  printerId?: string;       // Target printer ID
  copies?: number;          // Number of copies (default: 1)
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  idempotencyKey?: string;  // Prevent duplicate prints
  openCashDrawer?: boolean; // Open drawer after bill print
}
```

### Data Types

#### KOTData (Kitchen Order Ticket)

```ts
interface KOTData {
  kotNumber: string;
  orderNumber: string | number;
  tableNumber?: string;
  orderMode: string;
  guestCount?: number;
  waiterName?: string;
  items: KOTItem[];
  kitchenNotes?: string;
  priority?: boolean;
  timestamp: Date;
}

interface KOTItem {
  name: string;
  quantity: number;
  modifiers?: { name: string; price?: number }[];
  specialInstructions?: string;
}
```

#### BillData (Receipt/Invoice)

```ts
interface BillData {
  businessName: string;
  invoiceNumber: string;
  orderNumber: string | number;
  items: BillItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  payments: PaymentTransaction[];
  timestamp: Date;
  // ... see types.ts for full interface
}
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│  XP-POS (React/Next.js)                                 │
│                                                         │
│  usePrintService() ──► ThermalPrintService              │
│                              │                          │
│                              ▼                          │
│                        ThermalPrintAdapter              │
│                              │                          │
└──────────────────────────────│──────────────────────────┘
                               │ HTTP (localhost:9100)
                               ▼
┌─────────────────────────────────────────────────────────┐
│  xp-thermal-service (Node.js)                           │
│                                                         │
│  /api/print ──► Queue ──► Template ──► ESC/POS         │
│                                                         │
└──────────────────────────────│──────────────────────────┘
                               │ Raw print (winspool.drv)
                               ▼
┌─────────────────────────────────────────────────────────┐
│  Thermal Printers (USB/Network)                         │
│  • Receipt printer (80mm)                               │
│  • Kitchen printer (80mm)                               │
│  • Bar printer (58mm)                                   │
└─────────────────────────────────────────────────────────┘
```

## Printer Setup

### 1. Install Printer Driver

Install your thermal printer's Windows driver.

### 2. Find Printer Name

```powershell
Get-Printer | Select-Object Name
```

### 3. Register with xp-thermal-service

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

## Error Handling

```tsx
const { printKOT, error, clearError, isConnected } = usePrintService();

const handlePrint = async () => {
  if (!isConnected) {
    toast.error('Printer offline');
    return;
  }
  
  const result = await printKOT(data);
  
  if (!result.success) {
    toast.error(`Print failed: ${result.error}`);
  } else {
    toast.success('Sent to printer');
  }
};

// Clear error after showing
useEffect(() => {
  if (error) {
    toast.error(error);
    clearError();
  }
}, [error]);
```

## Integration Notes

This module replaces the previous HTML/browser-based `window.print()` approach. Benefits:

- ✅ Works with thermal printers (ESC/POS protocol)
- ✅ No browser print dialog
- ✅ Job queue with retry logic
- ✅ Multi-printer support (kitchen, bar, receipt)
- ✅ Cash drawer control
- ✅ Offline detection and auto-reconnect
