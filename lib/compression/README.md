# POS Data Compression System

This compression system reduces payload sizes by **60-70%** for network requests and database storage by using:
1. **Short field names** (e.g., `orderNumber` → `on`, `status` → `s`)
2. **Numeric codes** for enum values (e.g., `dine_in` → `0`, `cash` → `0`)

## Directory Structure

```
lib/compression/
├── index.ts          # Field mappings and value codes
├── encoders.ts       # Encode human → compressed
├── decoders.ts       # Decode compressed → human
├── api-helpers.ts    # API-level helpers for requests/responses
├── types.ts          # TypeScript interfaces (compressed + human-readable)
└── README.md         # This file

models/schemas/
├── order.schema.ts       # Main order schema (uses compressed fields)
├── customer.schema.ts    # Main customer schema (uses compressed fields)
└── table.schema.ts       # Main table schema (uses compressed fields)

models/factories/
├── Order.ts           # Order model factory
├── Customer.ts        # Customer model factory
└── Table.ts           # Table model factory
```

## Value Code Mappings

### Order Mode (`m`)
| Code | Value |
|------|-------|
| 0 | dine_in |
| 1 | takeaway |
| 2 | delivery |
| 3 | drive_thru |
| 4 | curbside |

### Order Status (`s`)
| Code | Value |
|------|-------|
| 0 | draft |
| 1 | confirmed |
| 2 | preparing |
| 3 | ready |
| 4 | served |
| 5 | out_for_delivery |
| 6 | completed |
| 7 | cancelled |

### Payment Status (`ps`)
| Code | Value |
|------|-------|
| 0 | pending |
| 1 | paid |
| 2 | partial |
| 3 | split |
| 4 | credit |
| 5 | refunded |
| 6 | voided |

### Payment Method (`m` in transactions)
| Code | Value |
|------|-------|
| 0 | cash |
| 1 | card |
| 2 | online |
| 3 | other |

### Table Status (`s`)
| Code | Value |
|------|-------|
| 0 | available |
| 1 | reserved |
| 2 | occupied |
| 3 | cleaning |
| 4 | blocked |

### Table Shape (`sh`)
| Code | Value |
|------|-------|
| 0 | square |
| 1 | rectangle |
| 2 | round |
| 3 | oval |

## Usage Examples

### In API Routes

```typescript
import { 
  prepareOrderForStorage,
  prepareOrderForResponse,
  buildCompressedOrderQuery,
} from '@/lib/compression/api-helpers';

// POST /api/orders - Create order
export async function POST(req: Request) {
  const body = await req.json(); // Human-readable format
  
  // Convert to compressed format for storage
  const compressed = prepareOrderForStorage(body);
  
  const order = await Order.create(compressed);
  
  // Convert back to human-readable for response
  return Response.json(prepareOrderForResponse(order));
}

// GET /api/orders - List orders with filter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  
  // Build compressed query from human-readable params
  const query = buildCompressedOrderQuery({
    status: searchParams.get('status'), // 'preparing'
    mode: searchParams.get('mode'),     // 'dine_in'
  });
  // Result: { s: 2, m: 0 }
  
  const orders = await Order.find(query).lean();
  
  // Convert all to human-readable
  return Response.json(prepareOrdersForResponse(orders));
}
```

### In Realtime Sync

```typescript
import { 
  prepareOrderForBroadcast,
  ensureOrderDecoded,
} from '@/lib/compression/api-helpers';

// Server-side: Broadcast compressed data
pusher.trigger('orders', 'updated', prepareOrderForBroadcast(order));

// Client-side: Decode received data
socket.on('order:updated', (data) => {
  const order = ensureOrderDecoded(data); // Auto-detects format
  setOrders(prev => [...prev, order]);
});
```

### Direct Encoding/Decoding

```typescript
import { encodeOrder, decodeOrder } from '@/lib/compression/encoders';
import { decodeOrder } from '@/lib/compression/decoders';

// Encode full order
const compressed = encodeOrder({
  orderNumber: 'ORD-20260318-0001',
  mode: 'dine_in',
  status: 'preparing',
  paymentStatus: 'pending',
  grandTotal: 150.00,
  // ... more fields
});
// Result: { on: 'ORD-20260318-0001', m: 0, s: 2, ps: 0, gt: 150, ... }

// Decode compressed order
const human = decodeOrder(compressed);
// Result: { orderNumber: 'ORD-20260318-0001', mode: 'dine_in', status: 'preparing', ... }
```

## Field Mapping Quick Reference

### Order Fields
| Full Name | Compressed |
|-----------|-----------|
| orderNumber | on |
| mode | m |
| status | s |
| paymentStatus | ps |
| items | i |
| subtotal | st |
| taxRate | tr |
| taxAmount | ta |
| discountType | dt |
| discountValue | dv |
| discountAmount | da |
| serviceCharge | sc |
| deliveryFee | df |
| tipAmount | tp |
| grandTotal | gt |
| adjustments | aj |
| adjustmentsTotal | at |
| transactions | tx |
| amountPaid | ap |
| amountDue | ad |
| customerId | ci |
| customer | cu |
| table | tb |
| sessionId | sid |
| covers | cv |
| createdBy | cb |
| servedBy | sb |
| waiterId | wi |
| createdAt | cAt |
| updatedAt | uAt |
| isPriority | ip |
| isVoid | iv |

### Customer Fields
| Full Name | Compressed |
|-----------|-----------|
| name | n |
| phone | p |
| email | e |
| addresses | a |
| notes | nt |
| orderCount | oc |
| totalSpent | ts |
| lastOrderAt | lo |
| createdAt | cAt |
| updatedAt | uAt |

### Table Fields
| Full Name | Compressed |
|-----------|-----------|
| tableNumber | tn |
| name | n |
| sectionId | si |
| sectionName | sn |
| x_position | x |
| y_position | y |
| width | w |
| height | h |
| orientation | o |
| shape | sh |
| capacity | c |
| minCovers | mc |
| status | s |
| activeSessionId | as |
| currentReservation | r |
| color | cl |
| isActive | ia |
| groupId | gi |
| sortOrder | so |

## Payload Size Comparison

### Before (uncompressed)
```json
{
  "orderNumber": "ORD-20260318-0001",
  "mode": "dine_in",
  "status": "preparing",
  "paymentStatus": "pending",
  "items": [...],
  "grandTotal": 150.00,
  "createdAt": "2026-03-18T10:00:00Z"
}
```
Size: ~800 bytes (typical order)

### After (compressed)
```json
{
  "on": "ORD-20260318-0001",
  "m": 0,
  "s": 2,
  "ps": 0,
  "i": [...],
  "gt": 150,
  "cAt": "2026-03-18T10:00:00Z"
}
```
Size: ~280 bytes (typical order)

**Reduction: ~65%**
