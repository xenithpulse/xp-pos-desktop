/**
 * Master POS Data Injection API
 *
 * Loads the sample menu (categories, ingredients, menu items) and the sample
 * floor plan.
 *
 * The implementation lives in lib/demo-data/, NOT here. First-run bootstrap
 * loads the same data automatically (see lib/firstRun.ts), and two copies of
 * "what counts as sample data" would drift - at which point "remove the sample
 * data" would start leaving some of it behind. This route is now a thin
 * support-tool wrapper over the shared module.
 *
 * POST /api/injections/pos-data - load the sample data
 */

import { NextRequest, NextResponse } from "next/server";
import { guardInjections } from "@/lib/injectionsGuard";
import { mongooseConnect } from "@/lib/mongoose";
import { seedMenuData } from "@/lib/demo-data/menu";
import { seedTableData } from "@/lib/demo-data/tables";
import { updateSetupState } from "@/models/factories/SetupState";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = guardInjections(req);
  if (denied) return denied;

  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();

    const menu = await seedMenuData(conn);
    const tables = await seedTableData(conn);

    // Keep the flag honest, so the "remove sample data" control in the admin
    // area knows there is something to remove.
    await updateSetupState(conn, { demoDataLoaded: true, demoDataSeeding: false });

    return NextResponse.json({
      success: true,
      message: "Sample data loaded",
      duration: `${Date.now() - startTime}ms`,
      summary: {
        categories: `${menu.categories.created} created, ${menu.categories.updated} updated`,
        ingredients: `${menu.ingredients.created} created, ${menu.ingredients.updated} updated`,
        menuItems:
          `${menu.menuItems.created} created, ${menu.menuItems.updated} updated, ` +
          `${menu.menuItems.skipped} skipped, ${menu.menuItems.withImages} with local images`,
        tables: `${tables.tables} created, ${tables.skipped} left alone, ${tables.sections} sections`,
      },
      details: { menu, tables },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("POS Data Injection Error:", err);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
