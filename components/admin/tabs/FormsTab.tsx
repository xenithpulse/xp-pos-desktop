// components/admin/tabs/FormsTab.tsx
// Unified forms tab for creating and editing Tables, Menu Items, Categories, and Ingredients

'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  UtensilsCrossed,
  FolderTree,
  Package,
  Save,
  X,
  Plus,
  Upload,
  ImageIcon,
  Trash2,
} from 'lucide-react';
import { FormTarget, FormEntity } from '@/app/admin/manage/page';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface FormsTabProps {
  target: FormTarget | null;
  onSuccess: () => void;
  onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Config
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_CONFIG: Record<FormEntity, { label: string; icon: React.ReactNode }> = {
  table: { label: 'Table', icon: <LayoutGrid size={18} /> },
  'menu-item': { label: 'Menu Item', icon: <UtensilsCrossed size={18} /> },
  category: { label: 'Category', icon: <FolderTree size={18} /> },
  ingredient: { label: 'Ingredient', icon: <Package size={18} /> },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section type for zone select
// ─────────────────────────────────────────────────────────────────────────────

interface ISection {
  _id: string;
  name: string;
  color?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FormsTab({ target, onSuccess, onCancel }: FormsTabProps) {
  // If no target, show entity selector
  if (!target) {
    return <EntitySelector onSelect={(entity) => target && onCancel()} onCancel={onCancel} onSuccess={onSuccess} />;
  }

  // Render the appropriate form based on entity type
  switch (target.entity) {
    case 'table':
      return (
        <TableForm
          mode={target.mode}
          initialData={target.data}
          id={target.id}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      );
    case 'menu-item':
      return (
        <MenuItemForm
          mode={target.mode}
          initialData={target.data}
          id={target.id}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      );
    case 'category':
      return (
        <CategoryForm
          mode={target.mode}
          initialData={target.data}
          id={target.id}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      );
    case 'ingredient':
      return (
        <IngredientForm
          mode={target.mode}
          initialData={target.data}
          id={target.id}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      );
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Selector (when no target is set)
// ─────────────────────────────────────────────────────────────────────────────

interface EntitySelectorProps {
  onSelect: (entity: FormEntity) => void;
  onCancel: () => void;
  onSuccess: () => void;
}

function EntitySelector({ onSelect, onCancel, onSuccess }: EntitySelectorProps) {
  const [selectedEntity, setSelectedEntity] = useState<FormEntity | null>(null);

  if (selectedEntity) {
    // Render the create form for the selected entity
    switch (selectedEntity) {
      case 'table':
        return <TableForm mode="create" onSuccess={onSuccess} onCancel={() => setSelectedEntity(null)} />;
      case 'menu-item':
        return <MenuItemForm mode="create" onSuccess={onSuccess} onCancel={() => setSelectedEntity(null)} />;
      case 'category':
        return <CategoryForm mode="create" onSuccess={onSuccess} onCancel={() => setSelectedEntity(null)} />;
      case 'ingredient':
        return <IngredientForm mode="create" onSuccess={onSuccess} onCancel={() => setSelectedEntity(null)} />;
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-white mb-2">Create New</h2>
      <p className="text-[#888] text-sm mb-6">Select what you want to create:</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.entries(ENTITY_CONFIG) as [FormEntity, { label: string; icon: React.ReactNode }][]).map(
          ([entity, config]) => (
            <button
              key={entity}
              onClick={() => setSelectedEntity(entity)}
              className="flex items-center gap-4 p-5 bg-[#111] border border-white/[0.08] rounded-xl hover:border-white/[0.2] transition-all text-left group"
            >
              <div className="w-11 h-11 bg-white/[0.06] rounded-xl flex items-center justify-center text-[#888] group-hover:text-white transition-colors">
                {config.icon}
              </div>
              <div>
                <h3 className="font-medium text-white text-sm">
                  {config.label}
                </h3>
                <p className="text-xs text-[#555]">Create a new {config.label.toLowerCase()}</p>
              </div>
              <Plus className="ml-auto text-[#444] group-hover:text-white transition-colors" size={18} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Base Props
// ─────────────────────────────────────────────────────────────────────────────

interface FormBaseProps {
  mode: 'create' | 'edit';
  initialData?: Record<string, unknown>;
  id?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Form
// ─────────────────────────────────────────────────────────────────────────────

function TableForm({ mode, initialData, id, onSuccess, onCancel }: FormBaseProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sections, setSections] = useState<ISection[]>([]);

  const [formData, setFormData] = useState({
    tableNumber: (initialData?.tableNumber as string) || '',
    name: (initialData?.name as string) || '',
    capacity: (initialData?.capacity as number) || 4,
    minCovers: (initialData?.minCovers as number) || 1,
    shape: (initialData?.shape as string) || 'square',
    status: (initialData?.status as string) || 'available',
    sectionId: (initialData?.sectionId as string) || '',
    x_position: (initialData?.x_position as number) || 10,
    y_position: (initialData?.y_position as number) || 10,
    width: (initialData?.width as number) || 1,
    height: (initialData?.height as number) || 1,
  });

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await fetch('/api/tables/sections');
        if (res.ok) {
          const data = await res.json();
          setSections(data.sections || []);
        }
      } catch (error) {
        console.error('Failed to fetch sections:', error);
      }
    };
    fetchSections();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/tables' : `/api/tables/${id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save table');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormWrapper
      title={mode === 'create' ? 'Create Table' : 'Edit Table'}
      icon={<LayoutGrid className="text-white" />}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Table Number" required>
          <input
            type="text"
            value={formData.tableNumber}
            onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
            placeholder="e.g., T1, A01"
            className="form-input"
            required
          />
        </FormField>

        <FormField label="Display Name">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Window Table"
            className="form-input"
          />
        </FormField>

        <FormField label="Zone / Section">
          <select
            value={formData.sectionId}
            onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
            className="form-input"
          >
            <option value="">Unassigned</option>
            {sections.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Min Covers">
          <input
            type="number"
            value={formData.minCovers}
            onChange={(e) => setFormData({ ...formData, minCovers: parseInt(e.target.value) || 1 })}
            min={1}
            className="form-input"
          />
        </FormField>

        <FormField label="Capacity">
          <input
            type="number"
            value={formData.capacity}
            onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 2 })}
            min={1}
            className="form-input"
          />
        </FormField>

        <FormField label="Shape">
          <select
            value={formData.shape}
            onChange={(e) => setFormData({ ...formData, shape: e.target.value })}
            className="form-input"
          >
            <option value="square">Square</option>
            <option value="rectangle">Rectangle</option>
            <option value="round">Round</option>
            <option value="oval">Oval</option>
          </select>
        </FormField>

        <FormField label="Status">
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="form-input"
          >
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
            <option value="cleaning">Cleaning</option>
            <option value="blocked">Blocked</option>
          </select>
        </FormField>

        <FormField label="X Position (%)">
          <input
            type="number"
            value={formData.x_position}
            onChange={(e) => setFormData({ ...formData, x_position: parseInt(e.target.value) || 0 })}
            min={0}
            max={100}
            className="form-input"
          />
        </FormField>

        <FormField label="Y Position (%)">
          <input
            type="number"
            value={formData.y_position}
            onChange={(e) => setFormData({ ...formData, y_position: parseInt(e.target.value) || 0 })}
            min={0}
            max={100}
            className="form-input"
          />
        </FormField>

        <FormField label="Width (grid units)">
          <input
            type="number"
            value={formData.width}
            onChange={(e) => setFormData({ ...formData, width: parseInt(e.target.value) || 1 })}
            min={1}
            max={3}
            className="form-input"
          />
        </FormField>

        <FormField label="Height (grid units)">
          <input
            type="number"
            value={formData.height}
            onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) || 1 })}
            min={1}
            max={3}
            className="form-input"
          />
        </FormField>
      </div>
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu Item Form
// ─────────────────────────────────────────────────────────────────────────────

interface ICategory {
  _id: string;
  name: string;
}

interface IIngredientOption {
  _id: string;
  name: string;
  unit: string;
  stock: number;
}

interface IRecipeEntry {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
}

function MenuItemForm({ mode, initialData, id, onSuccess, onCancel }: FormBaseProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<IIngredientOption[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(
    (initialData?.image as string) || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recipe state
  const [recipe, setRecipe] = useState<IRecipeEntry[]>(
    (initialData?.recipe as IRecipeEntry[]) || []
  );

  // Extract categoryId from potentially populated object
  const resolvedCategoryId = typeof initialData?.categoryId === 'object' && initialData?.categoryId !== null
    ? (initialData.categoryId as { _id: string })._id
    : (initialData?.categoryId as string) || '';

  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    shortName: (initialData?.shortName as string) || '',
    description: (initialData?.description as string) || '',
    categoryId: resolvedCategoryId,
    itemType: (initialData?.itemType as string) || 'food',
    basePrice: (initialData?.basePrice as number) || 0,
    taxRate: (initialData?.taxRate as number) || 0,
    taxInclusive: (initialData?.taxInclusive as boolean) || false,
    isActive: (initialData?.isActive as boolean) ?? true,
    isAvailable: (initialData?.isAvailable as boolean) ?? true,
    isFeatured: (initialData?.isFeatured as boolean) || false,
    isPopular: (initialData?.isPopular as boolean) || false,
    isNewItem: (initialData?.isNewItem as boolean) || false,
    preparationTime: (initialData?.preparationTime as number) || 10,
    kitchenStation: (initialData?.kitchenStation as string) || '',
    spiceLevel: (initialData?.spiceLevel as string) || 'medium',
    calories: (initialData?.calories as number) || 0,
    image: (initialData?.image as string) || '',
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/menu/categories');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    const fetchIngredients = async () => {
      try {
        // Only recipe ingredients — supplies (packaging, gas, etc.) are not recipe-linked
        const res = await fetch('/api/ingredients?limit=500&kind=ingredient');
        if (res.ok) {
          const data = await res.json();
          setAvailableIngredients(data.ingredients || []);
        }
      } catch (error) {
        console.error('Failed to fetch ingredients:', error);
      }
    };
    fetchCategories();
    fetchIngredients();
  }, []);

  // Accepted client-side (kept in sync with the /api/upload allow-list).
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

  const processImageFile = async (file: File) => {
    setImageError('');

    // Validate file type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Unsupported file. Use PNG, JPG, WebP, GIF or AVIF.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image must be 5MB or smaller.');
      return;
    }

    // Show preview immediately for instant feedback
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setIsUploading(true);

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: uploadData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed. Please try again.');
      }

      const data = await res.json();
      const url = data.links?.[0];

      if (url) {
        setFormData((prev) => ({ ...prev, image: url }));
        setImagePreview(url);
      } else {
        throw new Error('No URL returned by the server.');
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image upload failed.');
      // Revert to the last successfully-saved image, if any
      setImagePreview(formData.image || null);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(previewUrl);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, image: '' }));
    setImagePreview(null);
    setImageError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/menu/items' : `/api/menu/items/${id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          basePrice: parseFloat(formData.basePrice.toString()),
          taxRate: parseFloat(formData.taxRate.toString()),
          preparationTime: parseInt(formData.preparationTime.toString()),
          calories: formData.calories ? parseInt(formData.calories.toString()) : undefined,
          image: formData.image || undefined,
          recipe: recipe.filter((r) => r.ingredientId && r.quantity > 0),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save menu item');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormWrapper
      title={mode === 'create' ? 'Create Menu Item' : 'Edit Menu Item'}
      icon={<UtensilsCrossed className="text-white" />}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      error={error}
    >
      <div className="space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Basic Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Margherita Pizza"
                className="form-input"
                required
              />
            </FormField>

            <FormField label="Short Name">
              <input
                type="text"
                value={formData.shortName}
                onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                placeholder="For kitchen display"
                className="form-input"
              />
            </FormField>

            <FormField label="Category" required className="sm:col-span-2">
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="form-input"
                required
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Description" className="sm:col-span-2">
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Item description..."
                className="form-input min-h-[80px]"
                rows={3}
              />
            </FormField>
          </div>
        </div>

        {/* Image Upload */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Item Image</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={handleImageUpload}
            className="hidden"
          />
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="relative w-28 h-28 flex-shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] overflow-hidden flex items-center justify-center">
              {imagePreview ? (
                <>
                  <img
                    src={imagePreview}
                    alt="Menu item"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    title="Remove image"
                    className="absolute top-1 right-1 w-6 h-6 bg-black/70 hover:bg-red-500/80 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={12} className="text-white" />
                  </button>
                </>
              ) : (
                <ImageIcon size={28} className="text-[#444]" />
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Drop zone / upload control */}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isUploading) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                disabled={isUploading}
                className={`w-full min-h-[7rem] px-4 py-3 rounded-xl border border-dashed transition-colors flex flex-col items-center justify-center gap-1.5 text-center disabled:opacity-60 disabled:cursor-not-allowed ${
                  isDragging
                    ? 'border-white/40 bg-white/[0.08]'
                    : 'border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.2]'
                }`}
              >
                <Upload size={18} className="text-[#888]" />
                <span className="text-sm text-[#ccc]">
                  {isUploading
                    ? 'Uploading…'
                    : imagePreview
                      ? 'Click or drop to replace image'
                      : 'Click to upload or drag & drop'}
                </span>
                <span className="text-xs text-[#555]">PNG, JPG, WebP, GIF or AVIF · Max 5MB</span>
              </button>

              {imageError && (
                <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                  <X size={12} /> {imageError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Type & Pricing */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Type & Pricing</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Item Type">
              <select
                value={formData.itemType}
                onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
                className="form-input"
              >
                <option value="food">Food</option>
                <option value="beverage">Beverage</option>
                <option value="combo">Combo</option>
                <option value="addon">Add-on</option>
              </select>
            </FormField>

            <FormField label="Base Price" required>
              <input
                type="number"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
                min={0}
                step={0.01}
                className="form-input"
                required
              />
            </FormField>

            <FormField label="Tax Rate (%)">
              <input
                type="number"
                value={formData.taxRate}
                onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                min={0}
                max={100}
                step={0.1}
                className="form-input"
              />
            </FormField>
          </div>
        </div>

        {/* Kitchen & Preparation */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Kitchen & Preparation</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Prep Time (min)">
              <input
                type="number"
                value={formData.preparationTime}
                onChange={(e) => setFormData({ ...formData, preparationTime: parseInt(e.target.value) || 10 })}
                min={0}
                className="form-input"
              />
            </FormField>

            <FormField label="Kitchen Station">
              <input
                type="text"
                value={formData.kitchenStation}
                onChange={(e) => setFormData({ ...formData, kitchenStation: e.target.value })}
                placeholder="e.g., Grill, Bar"
                className="form-input"
              />
            </FormField>

            <FormField label="Spice Level">
              <select
                value={formData.spiceLevel}
                onChange={(e) => setFormData({ ...formData, spiceLevel: e.target.value })}
                className="form-input"
              >
                <option value="">None</option>
                <option value="mild">Mild</option>
                <option value="medium">Medium</option>
                <option value="hot">Hot</option>
                <option value="extra_hot">Extra Hot</option>
              </select>
            </FormField>
          </div>
        </div>

        {/* Flags */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Recipe — Ingredients</h3>
          <p className="text-xs text-[#555] mb-3">
            Link ingredients used to make this item. Stock will auto-deduct when an order is completed.
          </p>
          <div className="space-y-2">
            {recipe.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={entry.ingredientId}
                  onChange={(e) => {
                    const ing = availableIngredients.find((i) => i._id === e.target.value);
                    const updated = [...recipe];
                    updated[idx] = {
                      ...updated[idx],
                      ingredientId: e.target.value,
                      name: ing?.name || '',
                      unit: ing?.unit || updated[idx].unit,
                    };
                    setRecipe(updated);
                  }}
                  className="form-input w-24"
                >
                  <option value="">Select ingredient</option>
                  {availableIngredients.map((ing) => (
                    <option key={ing._id} value={ing._id}>
                      {ing.name} ({ing.stock} {ing.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={entry.quantity}
                  onChange={(e) => {
                    const updated = [...recipe];
                    updated[idx] = { ...updated[idx], quantity: parseFloat(e.target.value) || 0 };
                    setRecipe(updated);
                  }}
                  min={0}
                  step={0.01}
                  placeholder="Qty"
                  className="form-input"
                />
                <span className="text-xs text-[#666] w-12 text-center">{entry.unit || '—'}</span>
                <button
                  type="button"
                  onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRecipe([...recipe, { ingredientId: '', name: '', quantity: 0, unit: '' }])}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#888] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-dashed border-white/[0.1] rounded-lg transition-colors w-full justify-center"
            >
              <Plus size={14} />
              Add Ingredient
            </button>
          </div>
        </div>

        {/* Status & Display */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Status & Display</h3>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <ToggleField
              label="Active"
              checked={formData.isActive}
              onChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
            <ToggleField
              label="Available"
              checked={formData.isAvailable}
              onChange={(checked) => setFormData({ ...formData, isAvailable: checked })}
            />
            <ToggleField
              label="Featured"
              checked={formData.isFeatured}
              onChange={(checked) => setFormData({ ...formData, isFeatured: checked })}
            />
            <ToggleField
              label="Popular"
              checked={formData.isPopular}
              onChange={(checked) => setFormData({ ...formData, isPopular: checked })}
            />
            <ToggleField
              label="New Item"
              checked={formData.isNewItem}
              onChange={(checked) => setFormData({ ...formData, isNewItem: checked })}
            />
          </div>
        </div>
      </div>
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Form
// ─────────────────────────────────────────────────────────────────────────────

function CategoryForm({ mode, initialData, id, onSuccess, onCancel }: FormBaseProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    slug: (initialData?.slug as string) || '',
    description: (initialData?.description as string) || '',
    color: (initialData?.color as string) || '#6366f1',
    icon: (initialData?.icon as string) || '',
    sortOrder: (initialData?.sortOrder as number) || 0,
    isActive: (initialData?.isActive as boolean) ?? true,
    isAvailableForDineIn: (initialData?.isAvailableForDineIn as boolean) ?? true,
    isAvailableForTakeaway: (initialData?.isAvailableForTakeaway as boolean) ?? true,
    isAvailableForDelivery: (initialData?.isAvailableForDelivery as boolean) ?? true,
    displayStartTime: (initialData?.displayStartTime as string) || '',
    displayEndTime: (initialData?.displayEndTime as string) || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/menu/categories' : `/api/menu/categories/${id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save category');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-generate slug from name
  useEffect(() => {
    if (mode === 'create' && !formData.slug && formData.name) {
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData((prev) => ({ ...prev, slug }));
    }
  }, [formData.name, formData.slug, mode]);

  return (
    <FormWrapper
      title={mode === 'create' ? 'Create Category' : 'Edit Category'}
      icon={<FolderTree className="text-white" />}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      error={error}
    >
      <div className="space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Basic Information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Appetizers"
                className="form-input"
                required
              />
            </FormField>

            <FormField label="Slug" required>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="e.g., appetizers"
                className="form-input"
                required
              />
            </FormField>

            <FormField label="Description" className="sm:col-span-2">
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Category description..."
                className="form-input min-h-[80px]"
                rows={3}
              />
            </FormField>
          </div>
        </div>

        {/* Appearance */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Appearance</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Color">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-12 h-10 rounded border border-gray-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="form-input flex-1"
                  placeholder="#6366f1"
                />
              </div>
            </FormField>

            <FormField label="Icon (emoji/char)">
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="🍕"
                className="form-input"
                maxLength={2}
              />
            </FormField>

            <FormField label="Sort Order">
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                min={0}
                className="form-input"
              />
            </FormField>
          </div>
        </div>

        {/* Time Availability */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Time-Based Availability</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Display Start Time">
              <input
                type="time"
                value={formData.displayStartTime}
                onChange={(e) => setFormData({ ...formData, displayStartTime: e.target.value })}
                className="form-input"
              />
            </FormField>

            <FormField label="Display End Time">
              <input
                type="time"
                value={formData.displayEndTime}
                onChange={(e) => setFormData({ ...formData, displayEndTime: e.target.value })}
                className="form-input"
              />
            </FormField>
          </div>
        </div>

        {/* Flags */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Availability</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ToggleField
              label="Active"
              checked={formData.isActive}
              onChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
            <ToggleField
              label="Dine-in"
              checked={formData.isAvailableForDineIn}
              onChange={(checked) => setFormData({ ...formData, isAvailableForDineIn: checked })}
            />
            <ToggleField
              label="Takeaway"
              checked={formData.isAvailableForTakeaway}
              onChange={(checked) => setFormData({ ...formData, isAvailableForTakeaway: checked })}
            />
            <ToggleField
              label="Delivery"
              checked={formData.isAvailableForDelivery}
              onChange={(checked) => setFormData({ ...formData, isAvailableForDelivery: checked })}
            />
          </div>
        </div>
      </div>
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient Form
// ─────────────────────────────────────────────────────────────────────────────

function IngredientForm({ mode, initialData, id, onSuccess, onCancel }: FormBaseProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: (initialData?.name as string) || '',
    stock: (initialData?.stock as number) || 0,
    unit: (initialData?.unit as string) || '',
    costPerUnit: (initialData?.costPerUnit as number) || 0,
    lowStockThreshold: (initialData?.lowStockThreshold as number) || 10,
    kind: (initialData?.kind as 'ingredient' | 'supply') || 'ingredient',
    category: (initialData?.category as string) || '',
    supplier: (initialData?.supplier as string) || '',
  });

  const avgCost = initialData?.avgCost as number | undefined;
  const lastCost = initialData?.lastCost as number | undefined;

  // For edit mode: delta-based stock adjustment
  const [stockAdjustment, setStockAdjustment] = useState({
    qty: 0,
    reason: 'restock' as 'restock' | 'manual_adjustment' | 'waste' | 'return',
    unitCost: 0,
    note: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = mode === 'create' ? '/api/ingredients' : `/api/ingredients/${id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          stock: parseFloat(formData.stock.toString()),
          costPerUnit: formData.costPerUnit ? parseFloat(formData.costPerUnit.toString()) : undefined,
          lowStockThreshold: parseInt(formData.lowStockThreshold.toString()),
          category: formData.category.trim() || undefined,
          supplier: formData.supplier.trim() || undefined,
          // On create, seed avg/last cost from the entered unit cost
          ...(mode === 'create' && formData.costPerUnit ? { unitCost: parseFloat(formData.costPerUnit.toString()) } : {}),
          ...(mode === 'edit' && stockAdjustment.qty !== 0 ? {
            stockAdjustment: {
              qty: stockAdjustment.qty,
              reason: stockAdjustment.reason,
              unitCost: stockAdjustment.reason === 'restock' && stockAdjustment.unitCost ? stockAdjustment.unitCost : undefined,
              note: stockAdjustment.note || undefined,
            },
          } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save ingredient');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormWrapper
      title={mode === 'create' ? 'Create Ingredient' : 'Edit Ingredient'}
      icon={<Package className="text-white" />}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      error={error}
    >
      <div className="space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Basic Information</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Name" required className="sm:col-span-3">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Tomatoes"
                className="form-input"
                required
              />
            </FormField>

            <FormField label="Type">
              <select
                value={formData.kind}
                onChange={(e) => setFormData({ ...formData, kind: e.target.value as 'ingredient' | 'supply' })}
                className="form-input"
              >
                <option value="ingredient">Ingredient (recipe)</option>
                <option value="supply">Supply (non-recipe)</option>
              </select>
            </FormField>

            <FormField label="Category">
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Produce, Packaging"
                className="form-input"
              />
            </FormField>

            <FormField label="Supplier">
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                placeholder="Optional"
                className="form-input"
              />
            </FormField>

            <FormField label="Unit" required>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="e.g., kg, pcs, L"
                className="form-input"
                required
              />
            </FormField>

            <FormField label={mode === 'create' ? 'Cost Per Unit' : 'Cost Per Unit (manual)'}>
              <input
                type="number"
                value={formData.costPerUnit}
                onChange={(e) => setFormData({ ...formData, costPerUnit: parseFloat(e.target.value) || 0 })}
                min={0}
                step={0.01}
                placeholder="0.00"
                className="form-input"
              />
            </FormField>

            <FormField label="Low Stock Alert">
              <input
                type="number"
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 10 })}
                min={0}
                className="form-input"
              />
            </FormField>
          </div>

          {mode === 'edit' && (avgCost != null || lastCost != null) && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#888] bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
              {avgCost != null && <span>Avg cost: <span className="font-mono text-white">{avgCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span> / {formData.unit}</span>}
              {lastCost != null && <span>Last purchase: <span className="font-mono text-white">{lastCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span> / {formData.unit}</span>}
              <span className="text-[#555]">(auto-computed from purchases)</span>
            </div>
          )}
        </div>

        {/* Stock */}
        <div>
          <h3 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Inventory</h3>
          {mode === 'create' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Initial Stock">
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step={0.1}
                  className="form-input"
                />
              </FormField>
              <FormField label="">
                <div className="text-sm text-[#555] pt-8">
                  Common units: kg, g, L, ml, pcs, dozen
                </div>
              </FormField>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                <div className="text-sm text-[#888]">Current Stock:</div>
                <div className="text-lg font-mono font-semibold text-white">{formData.stock} <span className="text-xs text-[#666]">{formData.unit}</span></div>
              </div>
              <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider">Stock Adjustment</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Quantity (+/-)">
                  <input
                    type="number"
                    value={stockAdjustment.qty}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, qty: parseFloat(e.target.value) || 0 })}
                    step={0.1}
                    placeholder="e.g., 50 or -10"
                    className="form-input"
                  />
                </FormField>
                <FormField label="Reason">
                  <select
                    value={stockAdjustment.reason}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value as any })}
                    className="form-input"
                  >
                    <option value="restock">Restock</option>
                    <option value="manual_adjustment">Manual Adjustment</option>
                    <option value="waste">Waste / Spoilage</option>
                    <option value="return">Return</option>
                  </select>
                </FormField>
                {stockAdjustment.reason === 'restock' && (
                  <FormField label="Unit Price (₨)">
                    <input
                      type="number"
                      value={stockAdjustment.unitCost}
                      onChange={(e) => setStockAdjustment({ ...stockAdjustment, unitCost: parseFloat(e.target.value) || 0 })}
                      min={0}
                      step={0.01}
                      placeholder="per unit — updates avg cost"
                      className="form-input"
                    />
                  </FormField>
                )}
                <FormField label="Note">
                  <input
                    type="text"
                    value={stockAdjustment.note}
                    onChange={(e) => setStockAdjustment({ ...stockAdjustment, note: e.target.value })}
                    placeholder="Optional note"
                    className="form-input"
                  />
                </FormField>
              </div>
              {stockAdjustment.qty !== 0 && (
                <div className={`text-xs px-3 py-2 rounded-lg ${stockAdjustment.qty > 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  New stock will be: {formData.stock + stockAdjustment.qty} {formData.unit}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

interface FormWrapperProps {
  title: string;
  icon: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string;
  children: React.ReactNode;
}

function FormWrapper({
  title,
  icon,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  children,
}: FormWrapperProps) {
  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={onSubmit}
      className="max-w-3xl mx-auto"
    >
      <h2 className="text-lg font-semibold flex items-center gap-3 mb-6 text-white">
        {icon}
        {title}
      </h2>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="bg-[#111] border border-white/[0.08] rounded-xl p-6 mb-6">
        {children}
      </div>

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg transition-colors flex items-center gap-2 text-sm text-[#888]"
        >
          <X size={15} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2 bg-white text-black hover:bg-white/90 disabled:bg-white/40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Save size={15} />
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </motion.form>
  );
}

interface FormFieldProps {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function FormField({ label, required, className, children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-[#888] mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 hover:bg-white/[0.07] transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-white/20 bg-[#111] text-white focus:ring-white/20"
      />
      <span className="text-sm text-[#ccc]">{label}</span>
    </label>
  );
}
