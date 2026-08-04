// lib/demo-data/menu.ts
//
// The sample menu: categories, ingredients and menu items.
//
// This logic used to live inside app/api/injections/pos-data/route.ts and its
// undo twin. It moved here because first-run bootstrap now loads the same data
// automatically, and two copies of "what counts as demo data" would drift -
// at which point "remove the sample data" would start leaving some of it behind.
//
// The seed and the removal are deliberately keyed the same way: everything is
// upserted by trimmed NAME, and removal deletes by that same set of names. That
// is what makes it safe to run on a POS someone has already started using -
// anything the owner created themselves has a name that is not in the bundled
// JSON, so it is never touched.

import { Connection } from "mongoose";
import fs from "fs";
import path from "path";
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

// Per-category colour + emoji, so the POS looks populated and deliberate on
// first run rather than like a list of grey rows.
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

export interface MenuSeedResult {
  categories: { total: number; created: number; updated: number; errors: string[] };
  ingredients: { total: number; created: number; updated: number; errors: string[] };
  menuItems: {
    total: number; created: number; updated: number; skipped: number;
    withImages: number; errors: string[]; warnings: string[];
  };
}

// Build a { menuItemId -> local image path } map from the images shipped in
// public/menu-item-images. Each file is named `<Name>_<24-hex mongo id>.jpg`,
// so we key on the trailing id - the same id present on each raw menu item.
// Next serves these statically, which works fully offline; the external S3 URLs
// in the source data are long dead.
function buildLocalImageMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const dir = path.join(process.cwd(), "public", "menu-item-images");
    for (const file of fs.readdirSync(dir)) {
      const m = file.match(/_([a-f0-9]{24})\.(?:jpe?g|png|webp)$/i);
      if (m) map.set(m[1].toLowerCase(), `/menu-item-images/${file}`);
    }
  } catch (err) {
    console.error("[demo-data] could not read menu-item-images:", err);
  }
  return map;
}

/** Names of everything this module considers "sample data". */
export function demoMenuNames() {
  return {
    categories: (categoriesData as RawCategory[]).map((c) => c.name.trim()),
    menuItems: (menuItemsData as RawMenuItem[]).map((m) => m.name.trim()),
    ingredients: (ingredientsData as IngredientPayload[]).map((i) => i.name.trim()),
  };
}

export async function seedMenuData(conn: Connection): Promise<MenuSeedResult> {
  const Category = CategoryModel(conn);
  const Ingredient = IngredientModel(conn);
  const MenuItem = MenuItemModel(conn);

  const localImageMap = buildLocalImageMap();

  const results: MenuSeedResult = {
    categories: { total: 0, created: 0, updated: 0, errors: [] },
    ingredients: { total: 0, created: 0, updated: 0, errors: [] },
    menuItems: { total: 0, created: 0, updated: 0, skipped: 0, withImages: 0, errors: [], warnings: [] },
  };

  // ── 1. Categories ────────────────────────────────────────────────────────
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
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      categoryNameToId.set(converted.name.toLowerCase(), category._id.toString());
      if (existing) results.categories.updated++;
      else results.categories.created++;
    } catch (err) {
      results.categories.errors.push(`${raw.name}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  // ── 2. Ingredients ───────────────────────────────────────────────────────
  const rawIngredients = ingredientsData as IngredientPayload[];
  results.ingredients.total = rawIngredients.length;

  for (const raw of rawIngredients) {
    try {
      const existing = await Ingredient.findOne({ name: raw.name });
      await Ingredient.findOneAndUpdate(
        { name: raw.name },
        { name: raw.name, stock: raw.stock, unit: raw.unit },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (existing) results.ingredients.updated++;
      else results.ingredients.created++;
    } catch (err) {
      results.ingredients.errors.push(`${raw.name}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  // ── 3. Menu items ────────────────────────────────────────────────────────
  const rawMenuItems = menuItemsData as RawMenuItem[];
  results.menuItems.total = rawMenuItems.length;

  for (const raw of rawMenuItems) {
    try {
      const converted = convertMenuItem(raw, categoryOldIdToName);

      const categoryId = categoryNameToId.get(converted.categoryName.toLowerCase());
      if (!categoryId) {
        results.menuItems.warnings.push(`${raw.name}: Category "${converted.categoryName}" not found`);
        results.menuItems.skipped++;
        continue;
      }

      const categorySlug = converted.categoryName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const sku = await generateSKU(conn, categorySlug);
      const existing = await MenuItem.findOne({ name: converted.name });
      const localImage = localImageMap.get(converted.oldId.toLowerCase());

      // Surface eye-catching items in the featured/popular rails so the
      // storefront does not look empty on first run.
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
          sku: existing?.sku || sku,
          description: converted.description,
          categoryId,
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
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      if (localImage) results.menuItems.withImages++;
      if (existing) results.menuItems.updated++;
      else results.menuItems.created++;
    } catch (err) {
      results.menuItems.errors.push(`${raw.name}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  return results;
}

export interface MenuRemoveResult {
  menuItems: number;
  categories: number;
  ingredients: number;
}

/**
 * Remove the sample menu.
 *
 * Deletes by the exact names that ship in the bundled JSON, so a real menu item
 * the owner added is never caught by it - even one sitting in a demo category.
 */
export async function removeMenuData(
  conn: Connection,
  opts: { includeIngredients?: boolean } = {},
): Promise<MenuRemoveResult> {
  const Category = CategoryModel(conn);
  const MenuItem = MenuItemModel(conn);
  const Ingredient = IngredientModel(conn);

  const names = demoMenuNames();

  // Menu items first - they reference categories.
  const items = await MenuItem.deleteMany({ name: { $in: names.menuItems } });
  const categories = await Category.deleteMany({ name: { $in: names.categories } });

  let ingredients = 0;
  if (opts.includeIngredients) {
    const res = await Ingredient.deleteMany({ name: { $in: names.ingredients } });
    ingredients = res.deletedCount ?? 0;
  }

  return {
    menuItems: items.deletedCount ?? 0,
    categories: categories.deletedCount ?? 0,
    ingredients,
  };
}
