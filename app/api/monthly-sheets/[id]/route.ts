// app/api/monthly-sheets/[id]/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const conn = await mongooseConnect();
    const MonthlySheet = MonthlySheetModel(conn);

    const sheet = await MonthlySheet.findById(id).lean();

    if (!sheet) {
      return NextResponse.json(
        { success: false, message: "Monthly sheet not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: sheet });
  } catch (error) {
    console.error("Error fetching monthly sheet:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
