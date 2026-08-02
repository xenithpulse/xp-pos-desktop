// models/schemas/menu.schema.ts

import { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Modifier Option - Individual selection within a modifier group
// ─────────────────────────────────────────────────────────────────────────────

export interface IModifierOption {
  name: string;
  priceAdjustment: number;  // Can be positive (extra charge) or negative (discount)
  isDefault?: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

const ModifierOptionSchema = new Schema<IModifierOption>({
  name: { type: String, required: true },
  priceAdjustment: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Modifier Group - e.g., "Size", "Toppings", "Spice Level"
// ─────────────────────────────────────────────────────────────────────────────

export type ModifierSelectionType = 'single' | 'multiple';

export interface IModifierGroup {
  _id?: Types.ObjectId;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  minSelections?: number;  // For multiple selection
  maxSelections?: number;  // For multiple selection
  options: IModifierOption[];
  sortOrder: number;
}

const ModifierGroupSchema = new Schema<IModifierGroup>({
  name: { type: String, required: true },
  selectionType: { 
    type: String, 
    enum: ['single', 'multiple'], 
    default: 'single' 
  },
  isRequired: { type: Boolean, default: false },
  minSelections: { type: Number, min: 0 },
  maxSelections: { type: Number, min: 1 },
  options: [ModifierOptionSchema],
  sortOrder: { type: Number, default: 0 },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Menu Category
// ─────────────────────────────────────────────────────────────────────────────

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  color?: string;           // For UI display
  icon?: string;            // Icon identifier
  parentId?: Types.ObjectId; // For subcategories
  sortOrder: number;
  isActive: boolean;
  isAvailableForDineIn: boolean;
  isAvailableForTakeaway: boolean;
  isAvailableForDelivery: boolean;
  displayStartTime?: string;  // e.g., "06:00" for breakfast items
  displayEndTime?: string;    // e.g., "11:00"
  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema: Schema = new Schema<ICategory>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    image: { type: String },
    color: { type: String, default: '#6366F1' },
    icon: { type: String },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isAvailableForDineIn: { type: Boolean, default: true },
    isAvailableForTakeaway: { type: Boolean, default: true },
    isAvailableForDelivery: { type: Boolean, default: true },
    displayStartTime: { type: String },
    displayEndTime: { type: String },
  },
  { 
    collection: 'menu_categories',
    timestamps: true,
  }
);

// Generate slug from name if not provided. MUST run on `validate` (not `save`)
// so the auto-filled slug is present before the `required: true` check runs —
// Mongoose validates before the save hook, so a pre('save') hook fires too late.
CategorySchema.pre('validate', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = this as any;
  if (!doc.slug && doc.name) {
    doc.slug = (doc.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Menu Item
// ─────────────────────────────────────────────────────────────────────────────

export type ItemType = 'food' | 'beverage' | 'combo' | 'addon';
export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
export type DietaryTag = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'nut_free' | 'halal' | 'kosher';

export interface IMenuItem extends Document {
  // Basic Info
  name: string;
  shortName?: string;       // For kitchen display
  sku: string;              // Stock keeping unit
  quickCode?: string;       // 3-digit quick-search code (e.g. "001")
  description?: string;
  
  // Categorization
  categoryId: Types.ObjectId;
  itemType: ItemType;
  
  // Pricing
  basePrice: number;
  costPrice?: number;       // For profit calculation
  taxRate: number;          // Percentage (e.g., 5 for 5%)
  taxInclusive: boolean;    // Is basePrice inclusive of tax?
  
  // Modifiers
  modifierGroups: IModifierGroup[];
  
  // Availability
  isActive: boolean;
  isAvailable: boolean;     // Real-time availability (out of stock)
  isAvailableForDineIn: boolean;
  isAvailableForTakeaway: boolean;
  isAvailableForDelivery: boolean;
  
  // Time-based availability
  availableStartTime?: string;
  availableEndTime?: string;
  availableDays?: number[];  // 0=Sunday, 1=Monday, etc.
  
  // Display
  image?: string;
  thumbnailImage?: string;
  displayOrder: number;
  isFeatured: boolean;
  isPopular: boolean;
  isNewItem: boolean;
  
  // Dietary & Allergens
  dietaryTags: DietaryTag[];
  allergens: string[];
  spiceLevel?: SpiceLevel;
  calories?: number;
  
  // Kitchen
  preparationTime: number;  // Minutes
  kitchenStation?: string;  // e.g., "Grill", "Fryer", "Bar"
  
  // Combo items
  comboItems?: {
    itemId: Types.ObjectId;
    quantity: number;
    isRequired: boolean;
  }[];
  
  // Inventory link (legacy single item)
  inventoryItemId?: Types.ObjectId;

  // Recipe - ingredients required to make this item
  recipe: {
    ingredientId: Types.ObjectId;
    name: string;         // Denormalized for display
    quantity: number;     // Amount needed per 1 unit of this menu item
    unit: string;         // Denormalized for display
  }[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export const MenuItemSchema: Schema = new Schema<IMenuItem>(
  {
    // Basic Info
    name: { type: String, required: true },
    shortName: { type: String },
    sku: { type: String, required: true, unique: true },
    quickCode: { type: String, index: true },
    description: { type: String },
    
    // Categorization
    categoryId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Category', 
      required: true,
      index: true,
    },
    itemType: {
      type: String,
      enum: ['food', 'beverage', 'combo', 'addon'],
      default: 'food',
    },
    
    // Pricing
    basePrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxInclusive: { type: Boolean, default: false },
    
    // Modifiers
    modifierGroups: [ModifierGroupSchema],
    
    // Availability
    isActive: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true },
    isAvailableForDineIn: { type: Boolean, default: true },
    isAvailableForTakeaway: { type: Boolean, default: true },
    isAvailableForDelivery: { type: Boolean, default: true },
    
    // Time-based availability
    availableStartTime: { type: String },
    availableEndTime: { type: String },
    availableDays: [{ type: Number, min: 0, max: 6 }],
    
    // Display
    image: { type: String },
    thumbnailImage: { type: String },
    displayOrder: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isPopular: { type: Boolean, default: false },
    isNewItem: { type: Boolean, default: false },
    
    // Dietary & Allergens
    dietaryTags: [{
      type: String,
      enum: ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'halal', 'kosher'],
    }],
    allergens: [{ type: String }],
    spiceLevel: {
      type: String,
      enum: ['none', 'mild', 'medium', 'hot', 'extra_hot'],
    },
    calories: { type: Number, min: 0 },
    
    // Kitchen
    preparationTime: { type: Number, default: 10, min: 0 },
    kitchenStation: { type: String },
    
    // Combo items
    comboItems: [{
      itemId: { type: Schema.Types.ObjectId, ref: 'MenuItem' },
      quantity: { type: Number, default: 1, min: 1 },
      isRequired: { type: Boolean, default: true },
    }],
    
    // Inventory link
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'Inventory' },

    // Recipe - ingredients required
    recipe: [{
      ingredientId: { type: Schema.Types.ObjectId, ref: 'Ingredient', required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0 },
      unit: { type: String, required: true },
    }],
  },
  {
    collection: 'menu_items',
    timestamps: true,
  }
);

// Indexes for common queries
MenuItemSchema.index({ categoryId: 1, isActive: 1, displayOrder: 1 });
MenuItemSchema.index({ isActive: 1, isAvailable: 1 });
MenuItemSchema.index({ name: 'text', shortName: 'text', sku: 'text', quickCode: 'text' });

// ─────────────────────────────────────────────────────────────────────────────
// Color/Label Mappings
// ─────────────────────────────────────────────────────────────────────────────

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  food: 'Food',
  beverage: 'Beverage',
  combo: 'Combo',
  addon: 'Add-on',
};

export const SPICE_LEVEL_LABELS: Record<SpiceLevel, string> = {
  none: 'No Spice',
  mild: 'Mild',
  medium: 'Medium',
  hot: 'Hot',
  extra_hot: 'Extra Hot',
};

export const DIETARY_TAG_LABELS: Record<DietaryTag, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten Free',
  dairy_free: 'Dairy Free',
  nut_free: 'Nut Free',
  halal: 'Halal',
  kosher: 'Kosher',
};

export const DIETARY_TAG_COLORS: Record<DietaryTag, string> = {
  vegetarian: 'bg-green-100 text-green-700',
  vegan: 'bg-emerald-100 text-emerald-700',
  gluten_free: 'bg-amber-100 text-amber-700',
  dairy_free: 'bg-blue-100 text-blue-700',
  nut_free: 'bg-orange-100 text-orange-700',
  halal: 'bg-purple-100 text-purple-700',
  kosher: 'bg-indigo-100 text-indigo-700',
};
