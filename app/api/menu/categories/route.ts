// app/api/menu/categories/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { CategoryModel, getCategoriesWithCounts } from '@/models/factories/Menu';
import { broadcastEvent } from '@/lib/realtime/eventBus';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve all categories
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_menu' });
  if (denied) return denied;

  const conn = await mongooseConnect();

  try {
    const { searchParams } = new URL(request.url);
    const withCounts = searchParams.get('withCounts') === 'true';
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    if (withCounts) {
      const categories = await getCategoriesWithCounts(conn);
      return NextResponse.json({ categories });
    }

    const Category = CategoryModel(conn);
    const query = activeOnly ? { isActive: true } : {};
    
    const categories = await Category.find(query)
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return NextResponse.json({ categories });
  } catch (e) {
    log('[Menu Categories API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new category
// ─────────────────────────────────────────────────────────────────────────────

interface CreateCategoryPayload {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
  isActive?: boolean;
  isAvailableForDineIn?: boolean;
  isAvailableForTakeaway?: boolean;
  isAvailableForDelivery?: boolean;
  displayStartTime?: string;
  displayEndTime?: string;
}

export async function POST(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_menu', license: 'write' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Category = CategoryModel(conn);

  try {
    const data: CreateCategoryPayload = await request.json();

    if (!data.name) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await Category.findOne({ 
      name: { $regex: new RegExp(`^${data.name}$`, 'i') } 
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A category with this name already exists' },
        { status: 400 }
      );
    }

    // Normalise the slug the form sends (fall back to schema auto-gen if blank).
    const slug = data.slug
      ? data.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      : undefined;

    const category = new Category({
      name: data.name,
      slug,
      description: data.description,
      image: data.image,
      color: data.color || '#6366F1',
      icon: data.icon,
      parentId: data.parentId,
      sortOrder: data.sortOrder || 0,
      isActive: data.isActive ?? true,
      isAvailableForDineIn: data.isAvailableForDineIn ?? true,
      isAvailableForTakeaway: data.isAvailableForTakeaway ?? true,
      isAvailableForDelivery: data.isAvailableForDelivery ?? true,
      displayStartTime: data.displayStartTime,
      displayEndTime: data.displayEndTime,
    });

    await category.save();

    broadcastEvent({
      type: 'menu:category_created',
      entityId: category._id.toString(),
      payload: { name: category.name },
      timestamp: Date.now(),
    });

    return NextResponse.json(category, { status: 201 });
  } catch (e) {
    log('[Menu Categories API][POST]', e);

    // Surface the real reason instead of an opaque 500 so the form can show it.
    const err = e as { code?: number; name?: string; message?: string; errors?: Record<string, { message: string }> };
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: 'A category with this name or slug already exists.' },
        { status: 400 }
      );
    }
    if (err?.name === 'ValidationError') {
      const first = err.errors ? Object.values(err.errors)[0]?.message : undefined;
      return NextResponse.json(
        { error: first || 'Invalid category data.' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
