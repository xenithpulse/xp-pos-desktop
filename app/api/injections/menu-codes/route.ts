/**
 * Menu Quick-Code Injection API
 *
 * Assigns sequential 3-digit codes (001, 002, 003 …) to every menu item
 * sorted by category → displayOrder → name.
 *
 * GET /api/injections/menu-codes  — assigns codes and returns summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { guardInjections } from '@/lib/injectionsGuard';
import { mongooseConnect } from '@/lib/mongoose';
import { MenuItemModel, CategoryModel } from '@/models/factories/Menu';
import { broadcastEvent } from '@/lib/realtime/eventBus';

export async function GET(req: NextRequest) {
  // Setup endpoints are destructive and unauthenticated by design, so they must
  // be unreachable in normal operation. This guard was written for that and then
  // not wired up here - see lib/injectionsGuard.ts.
  const denied = guardInjections(req);
  if (denied) return denied;

  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();
    const MenuItem = MenuItemModel(conn);
    const Category = CategoryModel(conn);

    // Fetch all categories sorted to get deterministic ordering
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const categoryOrder = new Map<string, number>();
    categories.forEach((cat, idx) => {
      categoryOrder.set(cat._id.toString(), idx);
    });

    // Fetch all active menu items
    const items = await MenuItem.find({ isActive: true })
      .sort({ categoryId: 1, displayOrder: 1, name: 1 })
      .lean();

    // Sort items by category display order, then displayOrder, then name
    const sorted = [...items].sort((a, b) => {
      const catA = categoryOrder.get(a.categoryId.toString()) ?? 9999;
      const catB = categoryOrder.get(b.categoryId.toString()) ?? 9999;
      if (catA !== catB) return catA - catB;
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.name.localeCompare(b.name);
    });

    // Assign sequential 3-digit codes
    const bulkOps = sorted.map((item, idx) => ({
      updateOne: {
        filter: { _id: item._id },
        update: { $set: { quickCode: String(idx + 1).padStart(3, '0') } },
      },
    }));

    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const result = await MenuItem.bulkWrite(bulkOps);
      modifiedCount = result.modifiedCount;

      if (modifiedCount > 0) {
        broadcastEvent({
          type: 'menu:item_updated',
          entityId: '__bulk_quickcodes__',
          payload: { modifiedCount, action: 'quick_codes_assigned' },
          timestamp: Date.now(),
        });
      }
    }

    const elapsed = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        totalItems: sorted.length,
        modifiedCount,
        codeRange: sorted.length > 0
          ? { first: '001', last: String(sorted.length).padStart(3, '0') }
          : null,
        elapsed: `${elapsed}ms`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[Inject Menu Codes]', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
