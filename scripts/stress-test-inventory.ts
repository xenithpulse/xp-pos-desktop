#!/usr/bin/env tsx
// scripts/stress-test-inventory.ts
// Stress-tests the inventory deduction engine with 3000 simulated orders.
// Run: npx tsx scripts/stress-test-inventory.ts

import mongoose from 'mongoose';
import { IngredientSchema } from '../models/schemas/ingredient.schema';
import { MenuItemSchema } from '../models/schemas/menu.schema';
import { Types } from 'mongoose';

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI!;
const TENANT_DB = process.env.TENANT_DB!;

if (!MONGODB_URI || !TENANT_DB) {
  console.error('Missing MONGODB_URI or TENANT_DB env vars');
  process.exit(1);
}

// Number of concurrent orders to simulate
const NUM_ORDERS = 3000;
const CONCURRENCY = 50; // parallel batch size

// ─────────────────────────────────────────────────────────────────────────────
// Inline deduction logic (same as lib/inventory.ts but standalone)
// ─────────────────────────────────────────────────────────────────────────────

type DeltaReason = 'restock' | 'order_deduction' | 'manual_adjustment' | 'waste' | 'return';

async function deductInventoryForOrder(
  conn: mongoose.Connection,
  orderId: string,
  orderItems: { ii: string; q: number }[],
) {
  const MenuItem = conn.models.MenuItem || conn.model('MenuItem', MenuItemSchema, 'menu_items');
  const Ingredient = conn.models.Ingredient || conn.model('Ingredient', IngredientSchema, 'ingredients');

  const menuItemIds = [...new Set(orderItems.map((i) => i.ii))];
  const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).select('_id recipe name').lean();
  const menuItemMap = new Map(menuItems.map((m: any) => [m._id.toString(), m]));

  const deductionMap = new Map<string, { qty: number; name: string; unit: string }>();

  for (const orderItem of orderItems) {
    const menuItem: any = menuItemMap.get(orderItem.ii);
    if (!menuItem?.recipe?.length) continue;

    for (const ri of menuItem.recipe) {
      if (!ri.ingredientId || !ri.quantity || ri.quantity <= 0) continue;
      const ingId = ri.ingredientId.toString();
      const needed = ri.quantity * orderItem.q;
      const existing = deductionMap.get(ingId);
      if (existing) existing.qty += needed;
      else deductionMap.set(ingId, { qty: needed, name: ri.name || 'Unknown', unit: ri.unit || '' });
    }
  }

  if (deductionMap.size === 0) return { success: true, deductions: 0, warnings: [] };

  const ingredientIds = [...deductionMap.keys()].map((id) => new Types.ObjectId(id));
  const currentIngredients = await Ingredient.find({ _id: { $in: ingredientIds } }).select('_id stock name').lean();
  const currentStockMap = new Map(currentIngredients.map((i: any) => [i._id.toString(), i.stock]));

  const now = new Date();
  const bulkOps: any[] = [];
  const warnings: string[] = [];

  for (const [ingredientId, { qty, name, unit }] of deductionMap) {
    const currentStock = currentStockMap.get(ingredientId) ?? 0;
    const safeQty = Math.min(qty, Math.max(0, currentStock));

    if (safeQty <= 0 && currentStock <= 0) {
      warnings.push(`${name} already at 0`);
      continue;
    }
    if (safeQty < qty) {
      warnings.push(`${name}: needed ${qty} but only ${currentStock} available`);
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
                note: `Stress test deduction`,
                at: now,
              }],
              $slice: -200,
            },
          },
        },
      },
    });
  }

  if (bulkOps.length === 0) return { success: true, deductions: 0, warnings };

  const result = await Ingredient.bulkWrite(bulkOps, { ordered: false });
  return { success: true, deductions: result.modifiedCount, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Inventory Stress Test: ${NUM_ORDERS} orders, concurrency ${CONCURRENCY}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const clusterConn = await mongoose.createConnection(MONGODB_URI).asPromise();
  const conn = clusterConn.useDb(TENANT_DB, { useCache: true });

  const MenuItem = conn.models.MenuItem || conn.model('MenuItem', MenuItemSchema, 'menu_items');
  const Ingredient = conn.models.Ingredient || conn.model('Ingredient', IngredientSchema, 'ingredients');

  // 1. Get existing menu items that have recipes
  const menuItemsWithRecipe = await MenuItem.find({
    recipe: { $exists: true, $not: { $size: 0 } },
  }).select('_id name recipe').lean();

  if (menuItemsWithRecipe.length === 0) {
    console.error('❌ No menu items with recipes found. Create some first.');
    await conn.close();
    process.exit(1);
  }

  console.log(`Found ${menuItemsWithRecipe.length} menu item(s) with recipes:\n`);
  for (const mi of menuItemsWithRecipe) {
    const m = mi as any;
    console.log(`  → ${m.name}: ${m.recipe.length} ingredient(s)`);
    for (const r of m.recipe) {
      console.log(`      ${r.name}: ${r.quantity} ${r.unit} per item`);
    }
  }

  // 2. Get current ingredient stock levels
  const ingredients = await Ingredient.find({}).select('_id name stock unit lowStockThreshold').lean();
  console.log(`\nCurrent stock levels (${ingredients.length} ingredients):`);
  for (const ing of ingredients) {
    const i = ing as any;
    console.log(`  ${i.name}: ${i.stock} ${i.unit} (threshold: ${i.lowStockThreshold})`);
  }

  // 3. Seed high stock for the test (so we don't hit 0 immediately)
  const SEED_STOCK = 100000;
  const ingredientIds = (menuItemsWithRecipe as any[]).flatMap((mi) =>
    mi.recipe.map((r: any) => r.ingredientId)
  );
  const uniqueIngIds = [...new Set(ingredientIds.map((id: any) => id.toString()))];

  console.log(`\n📦 Seeding ${uniqueIngIds.length} ingredients to ${SEED_STOCK} stock for test...`);
  await Ingredient.updateMany(
    { _id: { $in: uniqueIngIds.map((id) => new Types.ObjectId(id)) } },
    { $set: { stock: SEED_STOCK } }
  );

  // 4. Build simulated orders (each has 1-5 random menu items, qty 1-10)
  const fakeOrderId = () => new Types.ObjectId().toString();
  const orders = Array.from({ length: NUM_ORDERS }, () => {
    const numItems = 1 + Math.floor(Math.random() * 5);
    const items = Array.from({ length: numItems }, () => {
      const mi = menuItemsWithRecipe[Math.floor(Math.random() * menuItemsWithRecipe.length)] as any;
      return {
        ii: mi._id.toString(),
        q: 1 + Math.floor(Math.random() * 10),
      };
    });
    return { orderId: fakeOrderId(), items };
  });

  const totalItems = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.q, 0), 0);
  console.log(`\n🧪 Simulating ${NUM_ORDERS} orders (${totalItems} total item units)...\n`);

  // 5. Run deductions in batches
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let totalDeductions = 0;
  const allWarnings: string[] = [];

  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const batch = orders.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((o) => deductInventoryForOrder(conn, o.orderId, o.items))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        successCount++;
        totalDeductions += r.value.deductions;
        allWarnings.push(...r.value.warnings);
      } else {
        failCount++;
        console.error(`  ✗ ${r.reason?.message || r.reason}`);
      }
    }

    // Progress
    const pct = Math.min(100, Math.round(((i + batch.length) / orders.length) * 100));
    if (pct % 10 === 0 || i + batch.length >= orders.length) {
      process.stdout.write(`\r  Progress: ${pct}% (${i + batch.length}/${orders.length})`);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log('\n');

  // 6. Check final stock levels
  const finalIngredients = await Ingredient.find({
    _id: { $in: uniqueIngIds.map((id) => new Types.ObjectId(id)) },
  }).select('_id name stock unit totalConsumed').lean();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Orders:       ${NUM_ORDERS}`);
  console.log(`  Succeeded:    ${successCount}`);
  console.log(`  Failed:       ${failCount}`);
  console.log(`  Deductions:   ${totalDeductions}`);
  console.log(`  Duration:     ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`);
  console.log(`  Throughput:   ${(NUM_ORDERS / (elapsed / 1000)).toFixed(0)} orders/sec`);
  console.log(`  Warnings:     ${allWarnings.length}`);
  console.log('');
  console.log('Final stock levels:');
  for (const ing of finalIngredients) {
    const i = ing as any;
    const consumed = SEED_STOCK - i.stock;
    console.log(`  ${i.name}: ${i.stock} ${i.unit} (consumed: ${consumed}, totalConsumed field: ${i.totalConsumed})`);
    
    // Validate consistency
    if (i.stock < 0) {
      console.error(`  ❌ NEGATIVE STOCK DETECTED for ${i.name}: ${i.stock}`);
    }
  }

  // Unique warnings summary
  const warningCounts = new Map<string, number>();
  for (const w of allWarnings) {
    warningCounts.set(w, (warningCounts.get(w) || 0) + 1);
  }
  if (warningCounts.size > 0) {
    console.log(`\nWarning summary (${warningCounts.size} unique):`);
    for (const [msg, count] of warningCounts) {
      console.log(`  [${count}x] ${msg}`);
    }
  }

  // 7. Restore original stock
  console.log('\n🔄 Restoring original stock levels...');
  for (const ing of ingredients) {
    const i = ing as any;
    if (uniqueIngIds.includes(i._id.toString())) {
      await Ingredient.findByIdAndUpdate(i._id, {
        $set: { stock: i.stock, totalConsumed: 0, totalRestocked: 0 },
      });
    }
  }
  console.log('✅ Stock restored.');

  console.log('\n═══════════════════════════════════════════════════════════════');
  if (failCount === 0 && !finalIngredients.some((i: any) => i.stock < 0)) {
    console.log('✅ STRESS TEST PASSED — No failures, no negative stock');
  } else {
    console.log('❌ STRESS TEST FAILED — Check errors above');
  }
  console.log('═══════════════════════════════════════════════════════════════');

  await conn.close();
  await clusterConn.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
