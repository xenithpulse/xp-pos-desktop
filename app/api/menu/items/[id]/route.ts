// app/api/menu/items/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { MenuItemModel, CategoryModel } from "@/models/factories/Menu";
import { broadcastEvent } from "@/lib/realtime/eventBus";

const log = console.log;

type RouteContext = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve a single menu item by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const MenuItem = MenuItemModel(conn);

  try {
    const item = await MenuItem.findById(id)
      .populate("categoryId", "name color slug")
      .lean();

    if (!item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (e) {
    log("[Menu Items API][GET/:id]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Update a menu item by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const denied = await isAdminRequest({ requiredPerm: "manage_menu" });
  if (denied) return denied;

  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const MenuItem = MenuItemModel(conn);
  const Category = CategoryModel(conn);

  try {
    const data = await request.json();

    const existing = await MenuItem.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    // If categoryId is changing, validate the new category exists
    if (data.categoryId && data.categoryId !== existing.categoryId?.toString()) {
      const category = await Category.findById(data.categoryId);
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 400 });
      }
    }

    // If SKU is changing, check for duplicates
    if (data.sku && data.sku !== existing.sku) {
      const dupSku = await MenuItem.findOne({ sku: data.sku, _id: { $ne: id } });
      if (dupSku) {
        return NextResponse.json(
          { error: "An item with this SKU already exists" },
          { status: 400 }
        );
      }
    }

    // Build a clean update object with only known fields
    const allowedFields = [
      "name", "shortName", "sku", "quickCode", "description",
      "categoryId", "itemType",
      "basePrice", "costPrice", "taxRate", "taxInclusive",
      "modifierGroups",
      "isActive", "isAvailable",
      "isAvailableForDineIn", "isAvailableForTakeaway", "isAvailableForDelivery",
      "availableStartTime", "availableEndTime", "availableDays",
      "image", "thumbnailImage", "displayOrder",
      "isFeatured", "isPopular", "isNewItem",
      "dietaryTags", "allergens", "spiceLevel", "calories",
      "preparationTime", "kitchenStation",
      "recipe",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in data) {
        updateData[key] = data[key];
      }
    }

    const updated = await MenuItem.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate("categoryId", "name color slug")
      .lean();

    broadcastEvent({
      type: "menu:item_updated",
      entityId: id,
      payload: { name: updated?.name },
      timestamp: Date.now(),
    });

    return NextResponse.json(updated);
  } catch (e) {
    log("[Menu Items API][PUT/:id]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Delete a menu item by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const denied = await isAdminRequest({ requiredPerm: "manage_menu" });
  if (denied) return denied;

  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const MenuItem = MenuItemModel(conn);

  try {
    const deleted = await MenuItem.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    broadcastEvent({
      type: "menu:item_updated",
      entityId: id,
      payload: { name: deleted.name, deleted: true },
      timestamp: Date.now(),
    });

    return NextResponse.json({ message: "Menu item deleted" });
  } catch (e) {
    log("[Menu Items API][DELETE/:id]", e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
