/**
 * Injection Helper Functions
 * 
 * Converts MongoDB export format to schema-compatible format
 * and provides smart ingredient mapping based on menu item names
 */

import { ItemType, SpiceLevel, DietaryTag } from '@/models/schemas/menu.schema';

// ============== Type Definitions ==============

export interface MongoExportId {
  $oid: string;
}

export interface MongoExportDate {
  $date: string;
}

export interface RawMenuItem {
  _id: MongoExportId;
  name: string;
  category: MongoExportId;
  price: number;
  cost?: number;
  inStock?: number;
  unit?: string;
  description?: string;
  image?: string;
  isAvailable?: boolean;
  createdAt?: MongoExportDate;
  updatedAt?: MongoExportDate;
  __v?: number;
}

export interface RawCategory {
  _id: MongoExportId;
  name: string;
  description?: string;
  image?: string;
  __v?: number;
}

// New schema-compatible types
export interface ConvertedMenuItem {
  oldId: string;
  name: string;
  shortName?: string;
  description?: string;
  image?: string;
  categoryName: string;
  itemType: ItemType;
  basePrice: number;
  costPrice?: number;
  taxRate: number;
  isAvailable: boolean;
  preparationTime: number;
  dietaryTags: DietaryTag[];
  spiceLevel?: SpiceLevel;
  kitchenStation?: string;
}

export interface ConvertedCategory {
  oldId: string;
  name: string;
  slug: string;
  image?: string;
  sortOrder: number;
}

export interface ConvertedIngredient {
  name: string;
  stock: number;
  unit: string;
}

// ============== Conversion Functions ==============

/**
 * Extract string ID from MongoDB export format
 */
export function extractOid(ref: MongoExportId | string): string {
  if (typeof ref === 'string') return ref;
  return ref.$oid;
}

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Convert raw category to new schema format
 */
export function convertCategory(raw: RawCategory, index: number = 0): ConvertedCategory {
  return {
    oldId: extractOid(raw._id),
    name: raw.name.trim(),
    slug: generateSlug(raw.name),
    image: raw.image || undefined,
    sortOrder: index,
  };
}

/**
 * Convert raw menu item to new schema format
 */
export function convertMenuItem(
  raw: RawMenuItem,
  categoryMap: Map<string, string> // oldId -> name mapping
): ConvertedMenuItem {
  const categoryOldId = extractOid(raw.category);
  const categoryName = categoryMap.get(categoryOldId) || 'Uncategorized';
  
  const { itemType, dietaryTags, spiceLevel, prepTime, kitchenStation } = inferItemDetails(raw.name, categoryName);
  return {
    oldId: extractOid(raw._id),
    name: raw.name.trim(),
    shortName: raw.name.length > 20 ? raw.name.substring(0, 18).trim() : undefined,
    description: raw.description || undefined,
    image: raw.image || undefined,
    categoryName,
    itemType,
    basePrice: raw.price || 0,
    costPrice: raw.cost,
    taxRate: 0,
    isAvailable: raw.isAvailable !== false,
    preparationTime: prepTime,
    dietaryTags,
    spiceLevel,
    kitchenStation,
  };
}

// ============== Smart Item Details Inference ==============

interface InferResult {
  itemType: ItemType;
  dietaryTags: DietaryTag[];
  spiceLevel?: SpiceLevel;
  prepTime: number;
  kitchenStation?: string;
}

/**
 * Infer item details based on menu item name and category
 */
export function inferItemDetails(name: string, category: string): InferResult {
  const lowerName = name.toLowerCase();
  const lowerCategory = category.toLowerCase();
  const dietaryTags: DietaryTag[] = [];
  let spiceLevel: SpiceLevel | undefined;
  let prepTime = 10;
  let itemType: ItemType = 'food';
  let kitchenStation: string | undefined;

  // ---- Item Type detection ----
  if (lowerCategory.includes('beverage') || lowerCategory.includes('drink') ||
      lowerName.includes('juice') || lowerName.includes('lassi') || 
      lowerName.includes('tea') || lowerName.includes('coffee') ||
      lowerName.includes('soda') || lowerName.includes('water')) {
    itemType = 'beverage';
    kitchenStation = 'Bar';
    prepTime = 5;
  }

  // ---- Vegetarian detection ----
  if (lowerCategory.includes('vegetarian') || lowerCategory.includes('veg') ||
      lowerName.includes('paneer') || lowerName.includes('dal') ||
      lowerName.includes('sabzi') || lowerName.includes('aloo')) {
    dietaryTags.push('vegetarian');
  }

  // ---- Protein detection (non-veg) ----
  if (lowerName.includes('chicken') || lowerCategory.includes('chicken')) {
    prepTime = 15;
    kitchenStation = 'Grill';
  }
  
  if (lowerName.includes('mutton') || lowerCategory.includes('mutton')) {
    prepTime = 25;
    kitchenStation = 'Grill';
  }
  
  if (lowerName.includes('beef')) {
    prepTime = 20;
    kitchenStation = 'Grill';
  }
  
  if (lowerName.includes('fish') || lowerName.includes('prawn') || lowerName.includes('shrimp')) {
    prepTime = 15;
    kitchenStation = 'Fryer';
  }

  // ---- Bread/Tandoor items ----
  if (lowerName.includes('naan') || lowerName.includes('roti') || lowerName.includes('roghi')) {
    prepTime = 8;
    kitchenStation = 'Tandoor';
    dietaryTags.push('vegetarian');
  }
  
  if (lowerName.includes('paratha')) {
    prepTime = 10;
    kitchenStation = 'Tandoor';
  }

  // ---- Rice items ----
  if (lowerName.includes('biryani')) {
    prepTime = 30;
    kitchenStation = 'Main Kitchen';
    spiceLevel = 'medium';
  }
  
  if (lowerName.includes('pulao') || (lowerName.includes('rice') && !lowerName.includes('biryani'))) {
    prepTime = 20;
    kitchenStation = 'Main Kitchen';
  }

  // ---- Spice level detection ----
  if (lowerName.includes('extra hot') || lowerName.includes('achari')) {
    spiceLevel = 'extra_hot';
  } else if (lowerName.includes('hot') || lowerName.includes('tikka')) {
    spiceLevel = 'hot';
  } else if (lowerName.includes('mild')) {
    spiceLevel = 'mild';
  } else if (lowerName.includes('curry') || lowerName.includes('karahi') || 
             lowerName.includes('korma') || lowerName.includes('masala')) {
    spiceLevel = spiceLevel || 'medium';
    prepTime = Math.max(prepTime, 20);
    kitchenStation = kitchenStation || 'Main Kitchen';
  }

  // ---- Fried items ----
  if (lowerName.includes('fried') || lowerName.includes('crispy') || 
      lowerName.includes('pakora') || lowerName.includes('samosa')) {
    kitchenStation = 'Fryer';
    prepTime = Math.max(prepTime, 12);
  }

  // ---- BBQ/Grill items ----
  if (lowerName.includes('bbq') || lowerName.includes('tikka') || 
      lowerName.includes('kebab') || lowerName.includes('seekh') ||
      lowerName.includes('boti') || lowerName.includes('chop')) {
    kitchenStation = 'Grill';
    prepTime = Math.max(prepTime, 15);
  }

  return {
    itemType,
    dietaryTags,
    spiceLevel,
    prepTime,
    kitchenStation,
  };
}

