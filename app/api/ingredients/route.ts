// app/api/ingredients/route.ts
// API routes for managing ingredients

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { IngredientModel } from '@/models/factories/Ingredients';
import { isAdminRequest } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// GET - List all ingredients
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const lowStock = searchParams.get('lowStock') === 'true';
    const kind = searchParams.get('kind');           // 'ingredient' | 'supply'
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '100');
    const page = parseInt(searchParams.get('page') || '1');

    // Build query
    const query: Record<string, unknown> = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    if (kind === 'ingredient' || kind === 'supply') {
      query.kind = kind;
    }

    if (category) {
      query.category = category;
    }

    if (lowStock) {
      // Compare each ingredient's stock to its own lowStockThreshold
      query.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    }

    const skip = (page - 1) * limit;

    const [ingredients, total] = await Promise.all([
      Ingredient.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ingredient.countDocuments(query),
    ]);

    return NextResponse.json({
      ingredients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch ingredients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ingredients' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new ingredient
// ─────────────────────────────────────────────────────────────────────────────

interface CreateIngredientPayload {
  name: string;
  stock?: number;
  unit: string;
  costPerUnit?: number;
  lowStockThreshold?: number;
  kind?: 'ingredient' | 'supply';
  category?: string;
  supplier?: string;
  // Unit price of the initial stock purchase (seeds avgCost / lastCost)
  unitCost?: number;
}

export async function POST(req: NextRequest) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const data: CreateIngredientPayload = await req.json();

    // Validate required fields
    if (!data.name?.trim()) {
      return NextResponse.json(
        { error: 'Ingredient name is required' },
        { status: 400 }
      );
    }

    if (!data.unit?.trim()) {
      return NextResponse.json(
        { error: 'Unit is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name (escape regex metacharacters)
    const escapedName = data.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Ingredient.findOne({
      name: { $regex: `^${escapedName}$`, $options: 'i' },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'An ingredient with this name already exists' },
        { status: 409 }
      );
    }

    const initialStock = data.stock ?? 0;
    // Seed average cost from the initial purchase price (falls back to costPerUnit)
    const seedCost = data.unitCost ?? data.costPerUnit;

    const ingredient = await Ingredient.create({
      name: data.name.trim(),
      stock: initialStock,
      unit: data.unit.trim(),
      costPerUnit: data.costPerUnit,
      avgCost: initialStock > 0 && seedCost != null ? seedCost : undefined,
      lastCost: seedCost,
      lowStockThreshold: data.lowStockThreshold ?? 10,
      kind: data.kind === 'supply' ? 'supply' : 'ingredient',
      category: data.category?.trim() || undefined,
      supplier: data.supplier?.trim() || undefined,
      totalRestocked: initialStock,
      deltas: initialStock ? [{
        qty: initialStock,
        reason: 'restock',
        unitCost: data.unitCost,
        balanceAfter: initialStock,
        note: 'Initial stock',
        at: new Date(),
      }] : [],
    });

    return NextResponse.json(ingredient, { status: 201 });
  } catch (error) {
    console.error('Failed to create ingredient:', error);
    return NextResponse.json(
      { error: 'Failed to create ingredient' },
      { status: 500 }
    );
  }
}
