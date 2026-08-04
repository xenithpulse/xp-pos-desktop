/**
 * POS Data Injection — UNDO
 *
 * Reverses what `POST /api/injections/pos-data` loaded. It removes ONLY the
 * seeded records — matched against the exact names that ship in the bundled
 * JSON, and the exact table numbers in lib/demo-data/tables.ts — so it never
 * touches anything the operator created by hand. The static image files under
 * public/menu-item-images are repo assets and stay put, so re-seeding still
 * works offline.
 *
 * The implementation lives in lib/demo-data/. See the note in pos-data/route.ts
 * for why.
 *
 * NOTE: this is the support-tool entry point, behind ENABLE_SETUP_ENDPOINTS.
 * The one a customer uses is POST /api/admin/demo-data, which is authenticated
 * and additionally requires the default password to have been changed first.
 *
 * POST /api/injections/pos-data-undo                 → remove sample menu + tables
 * POST /api/injections/pos-data-undo?ingredients=1   → also remove the seeded ingredients
 */

import { NextRequest, NextResponse } from "next/server";
import { guardInjections } from "@/lib/injectionsGuard";
import { mongooseConnect } from "@/lib/mongoose";
import { removeMenuData } from "@/lib/demo-data/menu";
import { removeTableData } from "@/lib/demo-data/tables";
import { updateSetupState } from "@/models/factories/SetupState";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = guardInjections(request);
  if (denied) return denied;

  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();

    const param = request.nextUrl.searchParams.get("ingredients");
    const includeIngredients = param === "1" || param === "true";

    const menu = await removeMenuData(conn, { includeIngredients });
    const tables = await removeTableData(conn);

    await updateSetupState(conn, { demoDataLoaded: false });

    return NextResponse.json({
      success: true,
      message: "Sample data removed",
      duration: `${Date.now() - startTime}ms`,
      summary: {
        menuItems: `${menu.menuItems} removed`,
        categories: `${menu.categories} removed`,
        ingredients: includeIngredients
          ? `${menu.ingredients} removed`
          : "left intact (pass ?ingredients=1 to remove)",
        tables: `${tables.tables} removed, ${tables.sections} sections removed`,
        tablesInUse:
          tables.inUse > 0
            ? `${tables.inUse} left in place - they are occupied or have an open session`
            : "none",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("POS Data Undo Error:", err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
