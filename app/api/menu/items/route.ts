// app/api/menu/items/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import {
  MenuItemModel,
  getMenuItemsByCategory,
  searchMenuItems,
  getFeaturedItems,
  generateSKU,
} from '@/models/factories/Menu';
import { CategoryModel } from '@/models/factories/Menu';
import { broadcastEvent } from '@/lib/realtime/eventBus';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve menu items with filtering
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_menu' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const MenuItem = MenuItemModel(conn);
  const Category = CategoryModel(conn);
  console.log('[Menu Items API][GET] CategoryModel:', Category ? 'Loaded' : 'Not Loaded');

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const search = searchParams.get('search');
    const featured = searchParams.get('featured') === 'true';
    const orderMode = searchParams.get('orderMode') as 'dine_in' | 'takeaway' | 'delivery' | null;
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const fetchAll = searchParams.get('all') === 'true';
    const limit = fetchAll ? 0 : parseInt(searchParams.get('limit') || '100');

    // Featured items endpoint
    if (featured) {
      const items = await getFeaturedItems(conn, limit);
      return NextResponse.json({ items });
    }

    // Search endpoint
    if (search) {
      const items = await searchMenuItems(conn, search, limit);
      return NextResponse.json({ items });
    }

    // Category-specific items
    if (categoryId) {
      const items = await getMenuItemsByCategory(conn, categoryId, {
        orderMode: orderMode || undefined,
        includeUnavailable: !activeOnly,
      });
      return NextResponse.json({ items });
    }

    // Default: return all active items
    const query: Record<string, unknown> = {};
    if (activeOnly) {
      query.isActive = true;
    }

    let q = MenuItem.find(query)
      .populate('categoryId', 'name color slug')
      .sort({ displayOrder: 1, name: 1 });
    if (limit > 0) q = q.limit(limit);
    const items = await q.lean();

    return NextResponse.json({ items });
  } catch (e) {
    log('[Menu Items API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new menu item
// ─────────────────────────────────────────────────────────────────────────────

interface CreateMenuItemPayload {
  name: string;
  shortName?: string;
  sku?: string;
  description?: string;
  categoryId: string;
  itemType?: 'food' | 'beverage' | 'combo' | 'addon';
  basePrice: number;
  costPrice?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  modifierGroups?: any[];
  image?: string;
  thumbnailImage?: string;
  displayOrder?: number;
  isFeatured?: boolean;
  isPopular?: boolean;
  isNewItem?: boolean;
  dietaryTags?: string[];
  allergens?: string[];
  spiceLevel?: string;
  calories?: number;
  preparationTime?: number;
  kitchenStation?: string;
  isAvailableForDineIn?: boolean;
  isAvailableForTakeaway?: boolean;
  isAvailableForDelivery?: boolean;
  recipe?: { ingredientId: string; name: string; quantity: number; unit: string }[];
}

export async function POST(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_menu', license: 'write' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const MenuItem = MenuItemModel(conn);
  const Category = CategoryModel(conn);

  try {
    const data: CreateMenuItemPayload = await request.json();

    if (!data.name || !data.categoryId || data.basePrice === undefined) {
      return NextResponse.json(
        { error: 'name, categoryId, and basePrice are required' },
        { status: 400 }
      );
    }

    // Validate category exists
    const category = await Category.findById(data.categoryId);
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 400 }
      );
    }

    // Generate SKU if not provided
    let sku = data.sku;
    if (!sku) {
      sku = await generateSKU(conn, category.slug || category.name);
    }

    // Check for duplicate SKU
    const existingSku = await MenuItem.findOne({ sku });
    if (existingSku) {
      return NextResponse.json(
        { error: 'An item with this SKU already exists' },
        { status: 400 }
      );
    }

    // Validate recipe entries if provided
    const validatedRecipe = (data.recipe || []).filter((r) => {
      if (!r.ingredientId || !r.name || !r.unit || typeof r.quantity !== 'number' || r.quantity <= 0) {
        return false;
      }
      if (!Types.ObjectId.isValid(r.ingredientId)) return false;
      return true;
    });

    const menuItem = new MenuItem({
      name: data.name,
      shortName: data.shortName,
      sku,
      description: data.description,
      categoryId: data.categoryId,
      itemType: data.itemType || 'food',
      basePrice: data.basePrice,
      costPrice: data.costPrice,
      taxRate: data.taxRate ?? 0,
      taxInclusive: data.taxInclusive ?? false,
      modifierGroups: data.modifierGroups || [],
      isActive: true,
      isAvailable: true,
      isAvailableForDineIn: data.isAvailableForDineIn ?? true,
      isAvailableForTakeaway: data.isAvailableForTakeaway ?? true,
      isAvailableForDelivery: data.isAvailableForDelivery ?? true,
      image: data.image,
      thumbnailImage: data.thumbnailImage,
      displayOrder: data.displayOrder ?? 0,
      isFeatured: data.isFeatured ?? false,
      isPopular: data.isPopular ?? false,
      isNewItem: data.isNewItem ?? false,
      dietaryTags: data.dietaryTags || [],
      allergens: data.allergens || [],
      spiceLevel: data.spiceLevel,
      calories: data.calories,
      preparationTime: data.preparationTime ?? 10,
      kitchenStation: data.kitchenStation,
      recipe: validatedRecipe,
    });

    await menuItem.save();

    broadcastEvent({
      type: 'menu:item_created',
      entityId: menuItem._id.toString(),
      payload: { name: menuItem.name, categoryId: data.categoryId },
      timestamp: Date.now(),
    });

    return NextResponse.json(menuItem, { status: 201 });
  } catch (e) {
    log('[Menu Items API][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
