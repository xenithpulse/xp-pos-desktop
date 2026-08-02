// app/api/inventory/summary/route.ts
// Inventory dashboard summary: valuation, value tiers, capital position, alerts.

import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { IngredientModel } from '@/models/factories/Ingredients';
import { getInventoryConfig } from '@/models/factories/InventoryConfig';
import { isAdminRequest } from '@/lib/auth';

interface LeanIngredient {
  _id: unknown;
  name: string;
  unit: string;
  stock: number;
  costPerUnit?: number;
  avgCost?: number;
  lowStockThreshold: number;
  kind?: 'ingredient' | 'supply';
  category?: string;
  totalConsumed?: number;
}

// Effective unit cost used for valuation (weighted avg preferred, manual fallback)
const unitValue = (i: LeanIngredient) => i.avgCost ?? i.costPerUnit ?? 0;
const itemValue = (i: LeanIngredient) => (i.stock || 0) * unitValue(i);

export async function GET() {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const [items, config] = await Promise.all([
      Ingredient.find({})
        .select('_id name unit stock costPerUnit avgCost lowStockThreshold kind category totalConsumed')
        .lean<LeanIngredient[]>(),
      getInventoryConfig(conn),
    ]);

    const tierHigh = config.tierHigh ?? 50000;
    const tierLow = config.tierLow ?? 10000;

    let stockValue = 0;
    let ingredientsCount = 0;
    let suppliesCount = 0;
    const tiers = {
      high: { count: 0, value: 0 },
      medium: { count: 0, value: 0 },
      low: { count: 0, value: 0 },
    };
    const byCategoryMap = new Map<string, { count: number; value: number }>();
    const lowStockItems: LeanIngredient[] = [];
    const outOfStockItems: LeanIngredient[] = [];

    for (const i of items) {
      const value = itemValue(i);
      stockValue += value;

      if (i.kind === 'supply') suppliesCount++;
      else ingredientsCount++;

      // value tier
      const tier = value >= tierHigh ? 'high' : value < tierLow ? 'low' : 'medium';
      tiers[tier].count++;
      tiers[tier].value += value;

      // category rollup
      const cat = i.category?.trim() || 'Uncategorized';
      const c = byCategoryMap.get(cat) ?? { count: 0, value: 0 };
      c.count++;
      c.value += value;
      byCategoryMap.set(cat, c);

      // alerts
      if ((i.stock || 0) <= 0) {
        outOfStockItems.push(i);
      } else if ((i.stock || 0) <= (i.lowStockThreshold ?? 0)) {
        lowStockItems.push(i);
      }
    }

    const byCategory = [...byCategoryMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.value - a.value);

    const topConsumers = [...items]
      .filter((i) => (i.totalConsumed ?? 0) > 0)
      .sort((a, b) => (b.totalConsumed ?? 0) - (a.totalConsumed ?? 0))
      .slice(0, 8)
      .map((i) => ({
        _id: i._id,
        name: i.name,
        unit: i.unit,
        totalConsumed: i.totalConsumed ?? 0,
      }));

    const cashInHand = config.cashInHand ?? 0;

    return NextResponse.json({
      counts: {
        total: items.length,
        ingredients: ingredientsCount,
        supplies: suppliesCount,
        lowStock: lowStockItems.length,
        outOfStock: outOfStockItems.length,
      },
      capital: {
        stockValue,
        cashInHand,
        totalCapital: stockValue + cashInHand,
        tierHigh,
        tierLow,
        cashNote: config.cashNote ?? '',
        cashUpdatedAt: config.cashUpdatedAt ?? null,
      },
      tiers,
      byCategory,
      lowStockItems: lowStockItems.map(slim),
      outOfStockItems: outOfStockItems.map(slim),
      topConsumers,
    });
  } catch (error) {
    console.error('Failed to build inventory summary:', error);
    return NextResponse.json({ error: 'Failed to build inventory summary' }, { status: 500 });
  }
}

function slim(i: LeanIngredient) {
  return {
    _id: i._id,
    name: i.name,
    unit: i.unit,
    stock: i.stock,
    lowStockThreshold: i.lowStockThreshold,
    kind: i.kind ?? 'ingredient',
    value: itemValue(i),
  };
}
