// types/menu.types.ts
// Client-side types for menu and POS functionality

// ─────────────────────────────────────────────────────────────────────────────
// Menu Types
// ─────────────────────────────────────────────────────────────────────────────

export type ItemType = 'food' | 'beverage' | 'combo' | 'addon';
export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
export type DietaryTag = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'nut_free' | 'halal' | 'kosher';
export type ModifierSelectionType = 'single' | 'multiple';

export interface IModifierOption {
  _id?: string;
  name: string;
  priceAdjustment: number;
  isDefault?: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

export interface IModifierGroup {
  _id?: string;
  name: string;
  selectionType: ModifierSelectionType;
  isRequired: boolean;
  minSelections?: number;
  maxSelections?: number;
  options: IModifierOption[];
  sortOrder: number;
}

export interface ICategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  sortOrder: number;
  isActive: boolean;
  isAvailableForDineIn: boolean;
  isAvailableForTakeaway: boolean;
  isAvailableForDelivery: boolean;
  displayStartTime?: string;
  displayEndTime?: string;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface IMenuItem {
  _id: string;
  name: string;
  shortName?: string;
  sku: string;
  quickCode?: string;       // 3-digit quick-search code (e.g. "001")
  description?: string;
  categoryId: string | ICategory;
  itemType: ItemType;
  basePrice: number;
  costPrice?: number;
  taxRate: number;
  taxInclusive: boolean;
  modifierGroups: IModifierGroup[];
  isActive: boolean;
  isAvailable: boolean;
  isAvailableForDineIn: boolean;
  isAvailableForTakeaway: boolean;
  isAvailableForDelivery: boolean;
  availableStartTime?: string;
  availableEndTime?: string;
  availableDays?: number[];
  image?: string;
  thumbnailImage?: string;
  displayOrder: number;
  isFeatured: boolean;
  isPopular: boolean;
  isNewItem: boolean;
  dietaryTags: DietaryTag[];
  allergens: string[];
  spiceLevel?: SpiceLevel;
  calories?: number;
  preparationTime: number;
  kitchenStation?: string;
  recipe: IRecipeIngredient[];
  createdAt: string;
  updatedAt: string;
}

export interface IRecipeIngredient {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart/POS Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ISelectedModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustment: number;
}

export interface ICartItem {
  id: string;                    // Unique cart item ID
  menuItemId: string;
  name: string;
  shortName?: string;
  basePrice: number;
  quantity: number;
  modifiers: ISelectedModifier[];
  specialInstructions?: string;
  unitPrice: number;             // basePrice + modifier adjustments
  totalPrice: number;            // unitPrice * quantity
  taxRate: number;
  taxAmount: number;
  isFired: boolean;              // Has this been sent to kitchen?
  firedAt?: Date;
}

export interface ICart {
  items: ICartItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  itemCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label Mappings
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

export const SPICE_LEVEL_ICONS: Record<SpiceLevel, string> = {
  none: '🌱',
  mild: '🌶️',
  medium: '🌶️🌶️',
  hot: '🌶️🌶️🌶️',
  extra_hot: '🔥',
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

export const DIETARY_TAG_COLORS: Record<DietaryTag, { bg: string; text: string }> = {
  vegetarian: { bg: 'bg-green-100', text: 'text-green-700' },
  vegan: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  gluten_free: { bg: 'bg-amber-100', text: 'text-amber-700' },
  dairy_free: { bg: 'bg-blue-100', text: 'text-blue-700' },
  nut_free: { bg: 'bg-orange-100', text: 'text-orange-700' },
  halal: { bg: 'bg-purple-100', text: 'text-purple-700' },
  kosher: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate item price with selected modifiers
 */
export function calculateItemPrice(
  basePrice: number,
  modifiers: ISelectedModifier[]
): number {
  const modifierTotal = modifiers.reduce(
    (sum, mod) => sum + mod.priceAdjustment,
    0
  );
  return basePrice + modifierTotal;
}

/**
 * Calculate tax amount
 */
export function calculateTax(amount: number, taxRate: number, taxInclusive: boolean): number {
  if (taxInclusive) {
    // Extract tax from inclusive price
    return amount - (amount / (1 + taxRate / 100));
  }
  // Calculate tax on exclusive price
  return amount * (taxRate / 100);
}

/**
 * Generate unique cart item ID
 */
export function generateCartItemId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new cart item from menu item
 */
export function createCartItem(
  menuItem: IMenuItem,
  quantity: number,
  modifiers: ISelectedModifier[],
  specialInstructions?: string
): ICartItem {
  const unitPrice = calculateItemPrice(menuItem.basePrice, modifiers);
  const totalPrice = unitPrice * quantity;
  const taxAmount = calculateTax(totalPrice, menuItem.taxRate, menuItem.taxInclusive);

  return {
    id: generateCartItemId(),
    menuItemId: menuItem._id,
    name: menuItem.name,
    shortName: menuItem.shortName,
    basePrice: menuItem.basePrice,
    quantity,
    modifiers,
    specialInstructions,
    unitPrice,
    totalPrice,
    taxRate: menuItem.taxRate,
    taxAmount,
    isFired: false,
  };
}

/**
 * Calculate cart totals
 */
export function calculateCartTotals(items: ICartItem[]): Omit<ICart, 'items'> {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxTotal = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    subtotal,
    taxTotal,
    grandTotal: subtotal + taxTotal,
    itemCount,
  };
}

/**
 * Format price for display.
 * Reads currency from the global POS store settings when available.
 */
export function formatPrice(amount: number | undefined | null, currency?: string): string {
  const value = typeof amount === 'number' ? amount : 0;
  // Lazy-read from store if no override
  let symbol = currency;
  let locale = 'en-PK';
  let decimals = 2;
  let position: 'before' | 'after' = 'before';
  if (!symbol) {
    try {
      // Dynamic import avoided: posStore is already bundled client-side
      const { usePOSStore } = require('@/stores/posStore');
      const settings = usePOSStore.getState().settings;
      if (settings) {
        symbol = settings.currencySymbol;
        locale = settings.currencyLocale || 'en-PK';
        if (typeof settings.currencyDecimals === 'number') decimals = settings.currencyDecimals;
        if (settings.currencySymbolPosition === 'after') position = 'after';
      }
    } catch {
      // SSR / import guard
    }
  }
  if (!symbol) symbol = 'Rs.';
  const num = value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return position === 'after' ? `${num} ${symbol}` : `${symbol}${num}`;
}
