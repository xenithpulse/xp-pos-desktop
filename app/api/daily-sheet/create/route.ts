// app/api/daily-sheet/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { DailySheetModel } from "@/models/factories/DailySheet";
import { syncDailyToMonthlyByDailySheet } from "@/utils/monthlySync";
import { IDailySheet } from "@/models/schemas/dailySheet.schema";

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);

  const data = (await req.json()) as Partial<IDailySheet>;

  const dailySheet = new DailySheet(data);
  const created = await dailySheet.save();

  try {
    await syncDailyToMonthlyByDailySheet(created);
    console.log("[daily-sheet create] synced newly created daily to monthly.");
  } catch (err) {
    console.error("[daily-sheet create] failed to sync:", err);
    // intentionally not failing the request
  }

  return NextResponse.json(created);
}
