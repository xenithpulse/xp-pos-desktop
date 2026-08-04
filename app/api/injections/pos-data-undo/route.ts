/**
 * POS Data Injection — UNDO
 *
 * Reverses the demo data created by `GET /api/injections/pos-data`. It removes
 * ONLY the seeded demo records — matched against the exact category/menu-item
 * names that ship in the bundled JSON — so it never touches anything the
 * operator created by hand. Deleting the menu items also clears their (local)
 * image references; the static image files under public/menu-item-images are
 * repo assets and are intentionally left in place so a re-inject works offline.
 *
 * GET /api/injections/pos-data-undo                 → remove demo categories + menu items
 * GET /api/injections/pos-data-undo?ingredients=1   → also remove the seeded ingredients
 */

import { NextRequest, NextResponse } from "next/server";
import { guardInjections } from "@/lib/injectionsGuard";
import { mongooseConnect } from "@/lib/mongoose";
import { CategoryModel, MenuItemModel } from "@/models/factories/Menu";
import { IngredientModel } from "@/models/factories/Ingredients";
import categoriesData from "@/public/test.categories.json";
import ingredientsData from "@/public/ingredients.json";
import menuItemsData from "@/public/menuitems.json";
import { RawCategory, RawMenuItem } from "@/lib/helpers/injection";

interface IngredientPayload {
  name: string;
  stock: number;
  unit: string;
}

export async function GET(request: NextRequest) {
  // Setup endpoints are destructive and unauthenticated by design, so they must
  // be unreachable in normal operation. This guard was written for that and then
  // not wired up here - see lib/injectionsGuard.ts.
  const denied = guardInjections(request);
  if (denied) return denied;

  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();
    const Category = CategoryModel(conn);
    const MenuItem = MenuItemModel(conn);
    const Ingredient = IngredientModel(conn);

    const alsoIngredients =
      request.nextUrl.searchParams.get("ingredients") === "1" ||
      request.nextUrl.searchParams.get("ingredients") === "true";

    // The inject upserts by trimmed name, so reverse it by the same key.
    const categoryNames = (categoriesData as RawCategory[]).map((c) => c.name.trim());
    const menuItemNames = (menuItemsData as RawMenuItem[]).map((m) => m.name.trim());
    const ingredientNames = (ingredientsData as IngredientPayload[]).map((i) => i.name.trim());

    // Delete menu items first (they reference categories).
    const itemsResult = await MenuItem.deleteMany({ name: { $in: menuItemNames } });
    const categoriesResult = await Category.deleteMany({ name: { $in: categoryNames } });

    let ingredientsResult: { deletedCount?: number } = { deletedCount: 0 };
    if (alsoIngredients) {
      ingredientsResult = await Ingredient.deleteMany({ name: { $in: ingredientNames } });
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: "POS demo data removed",
      duration: `${duration}ms`,
      summary: {
        menuItems: `${itemsResult.deletedCount ?? 0} of ${menuItemNames.length} removed`,
        categories: `${categoriesResult.deletedCount ?? 0} of ${categoryNames.length} removed`,
        ingredients: alsoIngredients
          ? `${ingredientsResult.deletedCount ?? 0} of ${ingredientNames.length} removed`
          : "left intact (pass ?ingredients=1 to remove)",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("POS Data Undo Error:", err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
