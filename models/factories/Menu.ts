// models/factories/Menu.ts

import { Connection, Model } from 'mongoose';
import {
  ICategory,
  IMenuItem,
  CategorySchema,
  MenuItemSchema,
} from '../schemas/menu.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Category Model Factory
// ─────────────────────────────────────────────────────────────────────────────

export function CategoryModel(conn: Connection): Model<ICategory> {
  return conn.models.Category || conn.model<ICategory>('Category', CategorySchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// MenuItem Model Factory
// ─────────────────────────────────────────────────────────────────────────────

export function MenuItemModel(conn: Connection): Model<IMenuItem> {
  return conn.models.MenuItem || conn.model<IMenuItem>('MenuItem', MenuItemSchema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all active categories with item counts
 */
export async function getCategoriesWithCounts(conn: Connection) {
  const Category = CategoryModel(conn);
  const MenuItem = MenuItemModel(conn);

  const categories = await Category.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  // Get item counts per category
  const counts = await MenuItem.aggregate([
    { $match: { isActive: true, isAvailable: true } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);

  const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));

  return categories.map(cat => ({
    ...cat,
    itemCount: countMap.get(cat._id.toString()) || 0,
  }));
}

/**
 * Get menu items by category with availability filtering
 */
export async function getMenuItemsByCategory(
  conn: Connection,
  categoryId: string,
  options?: {
    orderMode?: 'dine_in' | 'takeaway' | 'delivery';
    includeUnavailable?: boolean;
  }
) {
  const MenuItem = MenuItemModel(conn);

  const query: Record<string, unknown> = {
    categoryId,
    isActive: true,
  };

  if (!options?.includeUnavailable) {
    query.isAvailable = true;
  }

  // Filter by order mode availability
  if (options?.orderMode === 'dine_in') {
    query.isAvailableForDineIn = true;
  } else if (options?.orderMode === 'takeaway') {
    query.isAvailableForTakeaway = true;
  } else if (options?.orderMode === 'delivery') {
    query.isAvailableForDelivery = true;
  }

  return MenuItem.find(query)
    .sort({ displayOrder: 1, name: 1 })
    .lean();
}

/**
 * Search menu items by name or SKU
 */
export async function searchMenuItems(
  conn: Connection,
  searchQuery: string,
  limit = 20
) {
  const MenuItem = MenuItemModel(conn);

  return MenuItem.find({
    isActive: true,
    $or: [
      { name: { $regex: searchQuery, $options: 'i' } },
      { shortName: { $regex: searchQuery, $options: 'i' } },
      { sku: { $regex: searchQuery, $options: 'i' } },
    ],
  })
    .limit(limit)
    .populate('categoryId', 'name color')
    .sort({ isPopular: -1, name: 1 })
    .lean();
}

/**
 * Get featured/popular items for quick access
 */
export async function getFeaturedItems(conn: Connection, limit = 12) {
  const MenuItem = MenuItemModel(conn);

  return MenuItem.find({
    isActive: true,
    isAvailable: true,
    $or: [{ isFeatured: true }, { isPopular: true }],
  })
    .limit(limit)
    .populate('categoryId', 'name color')
    .sort({ isFeatured: -1, isPopular: -1, displayOrder: 1 })
    .lean();
}

/**
 * Calculate item price with modifiers
 */
export function calculateItemPrice(
  basePrice: number,
  selectedModifiers: { groupId: string; optionId: string; priceAdjustment: number }[]
): number {
  const modifierTotal = selectedModifiers.reduce(
    (sum, mod) => sum + mod.priceAdjustment,
    0
  );
  return basePrice + modifierTotal;
}

/**
 * Generate SKU for new item
 */
export async function generateSKU(conn: Connection, categorySlug: string): Promise<string> {
  const MenuItem = MenuItemModel(conn);
  
  const prefix = categorySlug.substring(0, 3).toUpperCase();
  const count = await MenuItem.countDocuments({
    sku: { $regex: `^${prefix}-` },
  });
  
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}
