// lib/inventory.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Inventory Deduction Engine
// Deducts ingredients from stock when an order is completed.
// Looks up each order item's recipe (via the MenuItem) and bulk-decrements.
// Handles bulk pressure (1000s of items) by aggregating first, then one bulkWrite.
// ═══════════════════════════════════════════════════════════════════════════════

import { Connection, Types } from 'mongoose';
import { MenuItemModel } from '@/models/factories/Menu';
import { IngredientModel } from '@/models/factories/Ingredients';
import type { DeltaReason } from '@/models/schemas/ingredient.schema';
import { sendNotification } from '@/lib/helpers/notify';

type LowStockAlert = {
  ingredientId: string;
  name: string;
  newStock: number;
  threshold: number;
  unit: string;
};

interface OrderItem {
  ii: Types.ObjectId | string;   // itemId (menu item)
  q: number;                     // quantity ordered
}

interface DeductionResult {
  success: boolean;
  deductions: {
    ingredientId: string;
    ingredientName: string;
    qtyDeducted: number;
    newStock: number;
    unit: string;
  }[];
  /** Ingredients that dropped to / below their low-stock threshold as a result of this order. */
  lowStockAlerts: {
    ingredientId: string;
    name: string;
    newStock: number;
    threshold: number;
    unit: string;
  }[];
  warnings: string[];
  errors: string[];
}

// Maximum items to fetch in a single query to avoid MongoDB BSON size limits
const MENU_ITEM_BATCH_SIZE = 500;

/**
 * Deduct ingredients from inventory based on order items and their recipes.
 * 
 * Flow:
 *   1. Look up MenuItems (batched for large orders)
 *   2. Aggregate ingredient quantities across all items
 *   3. Pre-check current stock levels
 *   4. Execute one bulkWrite with all decrements
 *   5. Return results with warnings for negative stock
 *
 * @param conn - Mongoose connection
 * @param orderId - The order ID (for delta audit trail)
 * @param orderItems - Array of { ii (itemId), q (quantity) }
 */
export async function deductInventoryForOrder(
  conn: Connection,
  orderId: string,
  orderItems: OrderItem[],
): Promise<DeductionResult> {
  const MenuItem = MenuItemModel(conn);
  const Ingredient = IngredientModel(conn);

  const result: DeductionResult = {
    success: true,
    deductions: [],
    lowStockAlerts: [],
    warnings: [],
    errors: [],
  };

  if (!orderItems || orderItems.length === 0) {
    return result;
  }

  // 1. Gather all unique menu item IDs
  const menuItemIds = [...new Set(orderItems.map((i) => i.ii.toString()))];

  // 2. Fetch menu items in batches (handles 3000+ item orders)
  const menuItemMap = new Map<string, any>();
  for (let i = 0; i < menuItemIds.length; i += MENU_ITEM_BATCH_SIZE) {
    const batch = menuItemIds.slice(i, i + MENU_ITEM_BATCH_SIZE);
    const menuItems = await MenuItem.find({ _id: { $in: batch } })
      .select('_id recipe name')
      .lean();
    for (const m of menuItems) {
      menuItemMap.set(m._id.toString(), m);
    }
  }

  // 3. Aggregate required deductions per ingredient
  //    { ingredientId -> { qty, name, unit } }
  const deductionMap = new Map<string, { qty: number; name: string; unit: string }>();

  for (const orderItem of orderItems) {
    const menuItem = menuItemMap.get(orderItem.ii.toString());
    if (!menuItem) {
      result.warnings.push(`Menu item ${orderItem.ii} not found – skipping deduction`);
      continue;
    }

    const recipe = menuItem.recipe;
    if (!recipe || recipe.length === 0) {
      // No recipe linked – nothing to deduct
      continue;
    }

    for (const ri of recipe) {
      if (!ri.ingredientId || !ri.quantity || ri.quantity <= 0) continue;
      const ingId = ri.ingredientId.toString();
      const needed = ri.quantity * orderItem.q;
      const existing = deductionMap.get(ingId);
      if (existing) {
        existing.qty += needed;
      } else {
        deductionMap.set(ingId, { qty: needed, name: ri.name || 'Unknown', unit: ri.unit || '' });
      }
    }
  }

  if (deductionMap.size === 0) {
    return result; // Nothing to deduct
  }

  // 4. Pre-check current stock levels (one query)
  const ingredientIds = [...deductionMap.keys()].map((id) => new Types.ObjectId(id));
  const currentIngredients = await Ingredient.find({ _id: { $in: ingredientIds } })
    .select('_id stock name lowStockThreshold unit')
    .lean();

  const currentStockMap = new Map(
    currentIngredients.map((i) => [i._id.toString(), {
      stock: i.stock,
      name: i.name,
      threshold: i.lowStockThreshold ?? 0,
      unit: i.unit ?? '',
    }])
  );

  // Check for missing ingredients
  for (const [ingId, { name }] of deductionMap) {
    if (!currentStockMap.has(ingId)) {
      result.warnings.push(`Ingredient "${name}" (${ingId}) not found in database – skipping`);
      deductionMap.delete(ingId);
    }
  }

  if (deductionMap.size === 0) {
    return result;
  }

  // 5. Execute bulk deductions atomically per ingredient
  const now = new Date();
  const bulkOps = [];
  for (const [ingredientId, { qty, name, unit }] of deductionMap) {
    const current = currentStockMap.get(ingredientId);
    const currentStock = current?.stock ?? 0;

    // Clamp deduction to available stock to prevent negative stock
    const safeQty = Math.min(qty, Math.max(0, currentStock));
    
    if (safeQty <= 0 && currentStock <= 0) {
      result.warnings.push(
        `${name} already at 0 stock – cannot deduct ${qty} ${unit}. Order deduction skipped for this ingredient.`
      );
      continue;
    }

    if (safeQty < qty) {
      result.warnings.push(
        `${name}: needed ${qty} ${unit} but only ${currentStock} available. Deducting ${safeQty} ${unit} (stock will reach 0).`
      );
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: new Types.ObjectId(ingredientId), stock: { $gte: safeQty } },
        update: {
          $inc: { stock: -safeQty, totalConsumed: safeQty },
          $push: {
            deltas: {
              $each: [{
                qty: -safeQty,
                reason: 'order_deduction' as DeltaReason,
                orderId: new Types.ObjectId(orderId),
                note: `Order deduction (requested: ${qty})`,
                at: now,
              }],
              $slice: -200,
            },
          },
        },
      },
    });

    const newStock = currentStock - safeQty;
    result.deductions.push({
      ingredientId,
      ingredientName: name,
      qtyDeducted: safeQty,
      newStock,
      unit,
    });

    // Flag low-stock crossings so the caller can alert (fire after txn commits)
    const threshold = current?.threshold ?? 0;
    if (safeQty > 0 && newStock <= threshold) {
      result.lowStockAlerts.push({
        ingredientId,
        name,
        newStock,
        threshold,
        unit: current?.unit || unit,
      });
    }
  }

  if (bulkOps.length === 0) {
    return result;
  }

  try {
    const bulkResult = await Ingredient.bulkWrite(bulkOps, { ordered: false });

    // Check for any ops that didn't match (race condition where stock changed between check and update)
    if (bulkResult.modifiedCount < bulkOps.length) {
      const failedCount = bulkOps.length - bulkResult.modifiedCount;
      result.warnings.push(
        `${failedCount} ingredient(s) were not deducted (stock may have changed concurrently). ` +
        `A retry or manual check is recommended.`
      );
    }
  } catch (err) {
    result.success = false;
    result.errors.push(`Bulk deduction failed: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Revert (restock) the ingredient deductions previously made for an order —
 * used when a completed/paid order is cancelled or voided. Reverses EXACTLY what
 * was deducted (reads the recorded `order_deduction` deltas), so a clamped
 * deduction is restored to the same amount. Idempotent: if a `return` delta for
 * this order already exists, it's skipped (no double-restock). Never throws —
 * inventory revert must not block the cancel flow.
 */
export async function revertInventoryForOrder(
  conn: Connection,
  orderId: string,
): Promise<{ reverted: number }> {
  const Ingredient = IngredientModel(conn);
  try {
    const oid = new Types.ObjectId(orderId);
    // Ingredients that were deducted for this order.
    const ingredients = await Ingredient.find({
      deltas: { $elemMatch: { orderId: oid, reason: 'order_deduction' } },
    }).select('_id name deltas').lean();

    if (ingredients.length === 0) return { reverted: 0 };

    const now = new Date();
    const bulkOps: any[] = [];

    for (const ing of ingredients) {
      const deltas = (ing.deltas || []) as { orderId?: Types.ObjectId; reason: string; qty: number }[];
      // Already reverted for this order? Skip (idempotent).
      if (deltas.some((d) => d.orderId?.toString() === orderId && d.reason === 'return')) continue;
      // Sum the deducted qty (negative) for this order and restore its absolute value.
      const deducted = deltas
        .filter((d) => d.orderId?.toString() === orderId && d.reason === 'order_deduction')
        .reduce((s, d) => s + (d.qty || 0), 0);
      const restore = -deducted;
      if (restore <= 0) continue;

      bulkOps.push({
        updateOne: {
          filter: { _id: ing._id },
          update: {
            $inc: { stock: restore, totalConsumed: -restore },
            $push: {
              deltas: {
                $each: [{
                  qty: restore,
                  reason: 'return' as DeltaReason,
                  orderId: oid,
                  note: 'Order cancelled — stock returned',
                  at: now,
                }],
                $slice: -200,
              },
            },
          },
        },
      });
    }

    if (bulkOps.length === 0) return { reverted: 0 };
    await Ingredient.bulkWrite(bulkOps, { ordered: false });
    return { reverted: bulkOps.length };
  } catch (err) {
    console.error('[inventory] revertInventoryForOrder failed:', (err as Error).message);
    return { reverted: 0 };
  }
}

/**
 * Fire a low-stock warning notification for ingredients that crossed their
 * threshold. Call AFTER the order transaction commits — it's fire-and-forget
 * and must never block or fail the order flow.
 */
export async function notifyLowStock(
  alerts: LowStockAlert[],
  createdBy?: string,
): Promise<void> {
  if (!alerts || alerts.length === 0) return;

  const list = alerts
    .map((a) => `${a.name} (${a.newStock} ${a.unit})`)
    .join(', ');

  const message = alerts.length === 1
    ? `Low stock: ${alerts[0].name} is at ${alerts[0].newStock} ${alerts[0].unit} (threshold ${alerts[0].threshold})`
    : `Low stock: ${alerts.length} ingredients hit their threshold — ${list}`;

  try {
    await sendNotification({
      message,
      type: 'warning',
      resource: 'inventory',
      action: 'low_stock',
      createdBy,
    });
  } catch (err) {
    console.error('[inventory] Failed to send low-stock notification:', err);
  }
}
