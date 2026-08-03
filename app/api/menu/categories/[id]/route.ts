// app/api/menu/categories/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CategoryModel, MenuItemModel } from "@/models/factories/Menu";
import { broadcastEvent } from "@/lib/realtime/eventBus";

const log = console.log;

type RouteContext = { params: Promise<{ id: string }> };

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve a single category by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const Category = CategoryModel(conn);

  try {
    const category = await Category.findById(id).lean();
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json(category);
  } catch (e) {
    log("[Menu Categories API][GET/:id]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Update a category by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const denied = await isAdminRequest({ requiredPerm: "manage_menu", license: "write" });
  if (denied) return denied;

  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const Category = CategoryModel(conn);

  try {
    const data = await request.json();

    const existing = await Category.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // If the name is changing, guard against a duplicate (case-insensitive).
    if (data.name && data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await Category.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${data.name}$`, "i") },
      });
      if (dup) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 400 }
        );
      }
    }

    // Normalise slug if supplied so it stays URL-safe and unique-checkable.
    if (typeof data.slug === "string" && data.slug.trim()) {
      data.slug = data.slug
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    } else {
      delete data.slug; // don't overwrite an existing slug with an empty one
    }

    // Only persist known fields.
    const allowedFields = [
      "name", "slug", "description", "image", "color", "icon",
      "parentId", "sortOrder", "isActive",
      "isAvailableForDineIn", "isAvailableForTakeaway", "isAvailableForDelivery",
      "displayStartTime", "displayEndTime",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in data) updateData[key] = data[key];
    }

    const updated = await Category.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    broadcastEvent({
      type: "menu:category_updated",
      entityId: id,
      payload: { name: (updated as { name?: string } | null)?.name },
      timestamp: Date.now(),
    });

    return NextResponse.json(updated);
  } catch (e) {
    log("[Menu Categories API][PUT/:id]", e);

    const err = e as { code?: number; name?: string; errors?: Record<string, { message: string }> };
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: "A category with this name or slug already exists." },
        { status: 400 }
      );
    }
    if (err?.name === "ValidationError") {
      const first = err.errors ? Object.values(err.errors)[0]?.message : undefined;
      return NextResponse.json({ error: first || "Invalid category data." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Delete a category by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const denied = await isAdminRequest({ requiredPerm: "manage_menu", license: "write" });
  if (denied) return denied;

  const { id } = await ctx.params;

  const conn = await mongooseConnect();
  const Category = CategoryModel(conn);
  const MenuItem = MenuItemModel(conn);

  try {
    // Block deletion while items still reference this category, to avoid
    // orphaning menu items under a missing category.
    const inUse = await MenuItem.countDocuments({ categoryId: id });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse} menu item(s) still use this category.` },
        { status: 400 }
      );
    }

    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    broadcastEvent({
      type: "menu:category_updated",
      entityId: id,
      payload: { name: deleted.name, deleted: true },
      timestamp: Date.now(),
    });

    return NextResponse.json({ message: "Category deleted" });
  } catch (e) {
    log("[Menu Categories API][DELETE/:id]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
