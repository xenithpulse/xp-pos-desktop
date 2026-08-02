/**
 * Master POS Data Injection API
 * 
 * Bulk imports all POS data in correct order:
 * 1. Categories (to menu_categories collection)
 * 2. Ingredients  
 * 3. Menu Items (to menu_items collection)
 * 
 * GET /api/injections/pos-data - Import all POS data
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { mongooseConnect } from "@/lib/mongoose";
import { CategoryModel, MenuItemModel, generateSKU } from "@/models/factories/Menu";
import { IngredientModel } from "@/models/factories/Ingredients";
import {
  convertCategory,
  convertMenuItem,
  RawCategory,
  RawMenuItem,
} from "@/lib/helpers/injection";
import categoriesData from "@/public/test.categories.json";
import ingredientsData from "@/public/ingredients.json";
import menuItemsData from "@/public/menuitems.json";

interface IngredientPayload {
  name: string;
  stock: number;
  unit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo presentation: per-category colour + emoji icon so the injected POS looks
// populated and polished out of the box. Keyed by category name.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { color: string; icon: string }> = {
  Drinks: { color: "#0ea5e9", icon: "🥤" },
  Tandoor: { color: "#d97706", icon: "🫓" },
  "Chicken Items": { color: "#ef4444", icon: "🍗" },
  Sweet: { color: "#ec4899", icon: "🍮" },
  Curry: { color: "#f59e0b", icon: "🍲" },
  Rice: { color: "#eab308", icon: "🍚" },
  "Tawa Special": { color: "#f97316", icon: "🍳" },
  Mutton: { color: "#b91c1c", icon: "🥩" },
  BBQ: { color: "#7c2d12", icon: "🍢" },
  BreakFast: { color: "#22c55e", icon: "🍳" },
  Bakery: { color: "#a16207", icon: "🥐" },
  Ramadhan: { color: "#8b5cf6", icon: "🌙" },
};

// Build an { menuItemId -> local image path } map from the images that ship in
// public/menu-item-images. Each file is named `<Name>_<24-hex mongo id>.jpg`,
// so we key on the trailing id — the same id present on each raw menu item.
// These are served statically by Next at `/menu-item-images/<file>`, which works
// fully offline (unlike the dead external S3 URLs in the source data).
function buildLocalImageMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const dir = path.join(process.cwd(), "public", "menu-item-images");
    for (const file of fs.readdirSync(dir)) {
      const m = file.match(/_([a-f0-9]{24})\.(?:jpe?g|png|webp)$/i);
      if (m) map.set(m[1].toLowerCase(), `/menu-item-images/${file}`);
    }
  } catch (err) {
    console.error("[pos-data] could not read menu-item-images:", err);
  }
  return map;
}

export async function GET() {
  const startTime = Date.now();
  
  try {
    const conn = await mongooseConnect();
    const Category = CategoryModel(conn);
    const Ingredient = IngredientModel(conn);
    const MenuItem = MenuItemModel(conn);

    // Resolve local, offline-safe images for the menu items.
    const localImageMap = buildLocalImageMap();

    const results = {
      categories: { total: 0, created: 0, updated: 0, errors: [] as string[] },
      ingredients: { total: 0, created: 0, updated: 0, errors: [] as string[] },
      menuItems: { total: 0, created: 0, updated: 0, skipped: 0, withImages: 0, errors: [] as string[], warnings: [] as string[] },
    };
    
    // ============== 1. CATEGORIES ==============
    console.log("Injecting categories to menu_categories...");
    const rawCategories = categoriesData as RawCategory[];
    results.categories.total = rawCategories.length;
    const categoryNameToId = new Map<string, string>();
    const categoryOldIdToName = new Map<string, string>();
    
    for (const raw of rawCategories) {
      try {
        const converted = convertCategory(raw);
        categoryOldIdToName.set(converted.oldId, converted.name);
        
        const existing = await Category.findOne({ name: converted.name });
        
        const meta = CATEGORY_META[converted.name];

        const category = await Category.findOneAndUpdate(
          { name: converted.name },
          {
            name: converted.name,
            slug: converted.slug,
            // Source category images are dead external S3 URLs; drop them so the
            // offline demo shows the colour/icon instead of a broken image.
            image: "",
            color: meta?.color || "#6366F1",
            icon: meta?.icon,
            sortOrder: converted.sortOrder,
            isActive: true,
            isAvailableForDineIn: true,
            isAvailableForTakeaway: true,
            isAvailableForDelivery: true,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        categoryNameToId.set(converted.name.toLowerCase(), category._id.toString());
        
        if (existing) {
          results.categories.updated++;
        } else {
          results.categories.created++;
        }
      } catch (err) {
        results.categories.errors.push(`${raw.name}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    
    // ============== 2. INGREDIENTS ==============
    console.log("Injecting ingredients...");
    const rawIngredients = ingredientsData as IngredientPayload[];
    results.ingredients.total = rawIngredients.length;
    const ingredientNameToId = new Map<string, string>();
    
    for (const raw of rawIngredients) {
      try {
        const existing = await Ingredient.findOne({ name: raw.name });
        
        const ingredient = await Ingredient.findOneAndUpdate(
          { name: raw.name },
          { name: raw.name, stock: raw.stock, unit: raw.unit },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        ingredientNameToId.set(raw.name.toLowerCase(), ingredient._id.toString());
        
        if (existing) {
          results.ingredients.updated++;
        } else {
          results.ingredients.created++;
        }
      } catch (err) {
        results.ingredients.errors.push(`${raw.name}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    
    // ============== 3. MENU ITEMS ==============
    console.log("Injecting menu items to menu_items...");
    const rawMenuItems = menuItemsData as RawMenuItem[];
    results.menuItems.total = rawMenuItems.length;
    
    for (const raw of rawMenuItems) {
      try {
        const converted = convertMenuItem(raw, categoryOldIdToName);
        
        // Resolve category ID
        const categoryId = categoryNameToId.get(converted.categoryName.toLowerCase());
        if (!categoryId) {
          results.menuItems.warnings.push(`${raw.name}: Category "${converted.categoryName}" not found`);
          results.menuItems.skipped++;
          continue;
        }
        
        // Generate slug from category name for SKU generation
        const categorySlug = converted.categoryName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        
        // Generate SKU (async)
        const sku = await generateSKU(conn, categorySlug);

        const existing = await MenuItem.findOne({ name: converted.name });

        // Resolve the local (offline-safe) image by the item's original id.
        const localImage = localImageMap.get(converted.oldId.toLowerCase());

        // Demo polish: surface eye-catching items in the POS's featured/popular
        // rails so the storefront doesn't look empty on first run.
        const lowerName = converted.name.toLowerCase();
        const isFeatured = lowerName.includes("deal") || converted.categoryName === "BBQ";
        const isPopular =
          !!localImage &&
          ["Chicken Items", "BBQ", "Rice", "Tandoor"].includes(converted.categoryName);

        await MenuItem.findOneAndUpdate(
          { name: converted.name },
          {
            name: converted.name,
            shortName: converted.shortName,
            sku: existing?.sku || sku, // Preserve existing SKU or use generated
            description: converted.description,
            categoryId: categoryId,
            itemType: converted.itemType,
            basePrice: converted.basePrice,
            costPrice: converted.costPrice,
            taxRate: converted.taxRate,
            taxInclusive: true,
            modifierGroups: [],
            isActive: true,
            isAvailable: converted.isAvailable,
            isAvailableForDineIn: true,
            isAvailableForTakeaway: true,
            isAvailableForDelivery: true,
            // Prefer the local image; never persist the dead external S3 URL.
            image: localImage || "",
            displayOrder: 0,
            isFeatured,
            isPopular,
            isNewItem: false,
            dietaryTags: converted.dietaryTags,
            allergens: [],
            spiceLevel: converted.spiceLevel,
            preparationTime: converted.preparationTime,
            kitchenStation: converted.kitchenStation,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        if (localImage) results.menuItems.withImages++;

        if (existing) {
          results.menuItems.updated++;
        } else {
          results.menuItems.created++;
        }
      } catch (err) {
        results.menuItems.errors.push(`${raw.name}: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      message: "POS data injection completed",
      duration: `${duration}ms`,
      summary: {
        categories: `${results.categories.created} created, ${results.categories.updated} updated`,
        ingredients: `${results.ingredients.created} created, ${results.ingredients.updated} updated`,
        menuItems: `${results.menuItems.created} created, ${results.menuItems.updated} updated, ${results.menuItems.skipped} skipped, ${results.menuItems.withImages} with local images`,
      },
      details: results,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("POS Data Injection Error:", err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
