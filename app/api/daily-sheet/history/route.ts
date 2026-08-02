import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { DailySheetModel } from "@/models/factories/DailySheet";

export async function GET() {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  try {
    const sheets = await DailySheet.find().sort({ date: -1 }).lean();
    return NextResponse.json(sheets);
  } catch (error) {
    console.error('[GET /api/daily-sheet/summaries] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch daily sheets.' }, { status: 500 });
  }
}

export async function POST() {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1️⃣ Find today's sheet
    const todaySheet = await DailySheet.findOne({
      date: { $gte: todayStart, $lte: todayEnd },
    });

    if (!todaySheet) {
      return NextResponse.json({ error: 'No Daily Sheet to close.' }, { status: 404 });
    }

    // 2️⃣ Ensure it has meaningful content
    if (!todaySheet.entries.length && !todaySheet.slipEntries.length) {
      return NextResponse.json({ error: 'Nothing to close — no entries found.' }, { status: 400 });
    }

    // 3️⃣ Save as-is (history is just the existing document)

    // 4️⃣ Create a new blank DailySheet for the next day
    const newSheet = new DailySheet({
      date: new Date(), // now
      totalIncome: 0,
      totalExpense: 0,
      closingBalance: 0,
      notes: '',
      entries: [],
      slipEntries: [],
    });

    await newSheet.save();

    return NextResponse.json({ message: 'Day closed and reset.' }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/daily-sheet/history] Error:', error);
    return NextResponse.json({ error: 'Failed to close the day.' }, { status: 500 });
  }
}
