// app/api/ingredients/[id]/route.ts
// API routes for individual ingredient operations

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { mongooseConnect } from '@/lib/mongoose';
import { IngredientModel } from '@/models/factories/Ingredients';
import { isAdminRequest } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// GET - Get single ingredient by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const { id } = await params;
    
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid ingredient ID' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const ingredient = await Ingredient.findById(id).lean();

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('Failed to fetch ingredient:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ingredient' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Update an ingredient
// ─────────────────────────────────────────────────────────────────────────────

interface UpdateIngredientPayload {
  name?: string;
  stock?: number;
  unit?: string;
  costPerUnit?: number;
  lowStockThreshold?: number;
  kind?: 'ingredient' | 'supply';
  category?: string;
  supplier?: string;
  // Delta-based stock adjustment (preferred over direct stock set)
  stockAdjustment?: {
    qty: number;       // in 'delta' mode: +add / -deduct; in 'absolute' mode: the counted stock
    reason: 'restock' | 'manual_adjustment' | 'waste' | 'return' | 'stock_take' | 'transfer';
    mode?: 'delta' | 'absolute';   // 'absolute' = physical stock-take (qty is the counted total)
    unitCost?: number;             // purchase price per unit (for restock/purchase → recomputes avgCost)
    note?: string;
  };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const { id } = await params;
    
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid ingredient ID' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const data: UpdateIngredientPayload = await req.json();

    // Check for duplicate name if name is being updated (escape regex metacharacters)
    if (data.name) {
      const escapedName = data.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existing = await Ingredient.findOne({
        _id: { $ne: id },
        name: { $regex: `^${escapedName}$`, $options: 'i' },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'An ingredient with this name already exists' },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.unit !== undefined) updateData.unit = data.unit.trim();
    if (data.costPerUnit !== undefined) updateData.costPerUnit = data.costPerUnit;
    if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold;
    if (data.kind === 'ingredient' || data.kind === 'supply') updateData.kind = data.kind;
    if (data.category !== undefined) updateData.category = data.category.trim() || undefined;
    if (data.supplier !== undefined) updateData.supplier = data.supplier.trim() || undefined;

    // Delta-based / stock-take stock adjustment
    if (data.stockAdjustment) {
      const { reason, note, mode, unitCost } = data.stockAdjustment;

      // Read current state (needed for stock-take diff and weighted avg-cost)
      const current = await Ingredient.findById(id).select('stock avgCost costPerUnit').lean();
      if (!current) {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
      }
      const currentStock = (current as { stock: number }).stock ?? 0;
      const currentAvg = (current as { avgCost?: number; costPerUnit?: number }).avgCost
        ?? (current as { costPerUnit?: number }).costPerUnit
        ?? 0;

      // In 'absolute' mode (stock-take) the qty IS the counted total → convert to a diff
      const qty = mode === 'absolute'
        ? data.stockAdjustment.qty - currentStock
        : data.stockAdjustment.qty;

      if (qty === 0 && mode === 'absolute') {
        // No variance — nothing to record, just apply any field updates
        const ingredient = await Ingredient.findByIdAndUpdate(
          id,
          { $set: updateData },
          { new: true, runValidators: true }
        ).lean();
        return NextResponse.json(ingredient);
      }

      const balanceAfter = currentStock + qty;

      // Weighted-average cost recompute on a positive purchase with a known unit price
      const inc: Record<string, number> = {
        stock: qty,
        ...(qty > 0 ? { totalRestocked: qty } : { totalConsumed: Math.abs(qty) }),
      };
      const set: Record<string, unknown> = { ...updateData };
      if (qty > 0 && unitCost != null && unitCost >= 0) {
        const denom = currentStock + qty;
        const newAvg = denom > 0
          ? (currentStock * currentAvg + qty * unitCost) / denom
          : unitCost;
        set.avgCost = newAvg;
        set.lastCost = unitCost;
      }

      const delta = {
        qty,
        reason,
        unitCost: qty > 0 ? unitCost : undefined,
        balanceAfter,
        note,
        at: new Date(),
      };

      const ingredient = await Ingredient.findByIdAndUpdate(
        id,
        {
          $set: set,
          $inc: inc,
          $push: { deltas: { $each: [delta], $slice: -200 } }, // Keep last 200 deltas
        },
        { new: true, runValidators: true }
      ).lean();

      if (!ingredient) {
        return NextResponse.json(
          { error: 'Ingredient not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(ingredient);
    }

    // Direct stock set — create a delta for audit trail
    if (data.stock !== undefined) {
      // Fetch current stock to compute delta
      const current = await Ingredient.findById(id).select('stock').lean();
      if (current) {
        const diff = data.stock - (current as any).stock;
        if (diff !== 0) {
          const ingredient = await Ingredient.findByIdAndUpdate(
            id,
            {
              $set: { ...updateData, stock: data.stock },
              $inc: diff > 0 ? { totalRestocked: diff } : { totalConsumed: Math.abs(diff) },
              $push: {
                deltas: {
                  $each: [{ qty: diff, reason: 'manual_adjustment', note: `Direct stock set to ${data.stock}`, at: new Date() }],
                  $slice: -200,
                },
              },
            },
            { new: true, runValidators: true }
          ).lean();

          if (!ingredient) {
            return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
          }
          return NextResponse.json(ingredient);
        }
      }
      updateData.stock = data.stock;
    }

    const ingredient = await Ingredient.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ingredient);
  } catch (error) {
    console.error('Failed to update ingredient:', error);
    return NextResponse.json(
      { error: 'Failed to update ingredient' },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Delete an ingredient
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const { id } = await params;
    
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid ingredient ID' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const ingredient = await Ingredient.findByIdAndDelete(id).lean();

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      message: 'Ingredient deleted successfully',
      deleted: ingredient,
    });
  } catch (error) {
    console.error('Failed to delete ingredient:', error);
    return NextResponse.json(
      { error: 'Failed to delete ingredient' },
      { status: 500 }
    );
  }
}
