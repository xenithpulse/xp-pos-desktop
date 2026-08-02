// app/api/daily-sheet/close/route.ts
//
// Closes (posts) a daily sheet: finalizes its combined + per-method closing
// balances, marks it posted so no further slips/expenses can be added, and
// rolls the final figures up into the open monthly sheet.
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { persistDailyTotalsAndSync } from '@/utils/dailySheetPersist';
import { findActiveSheet } from '@/utils/dailySheetOpening';
import { Types } from 'mongoose';

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);

  const body = (await req.json().catch(() => ({}))) as { sheetId?: unknown };
  const sheetId = typeof body.sheetId === 'string' && Types.ObjectId.isValid(body.sheetId) ? body.sheetId : null;

  // Locate the sheet: by id when supplied, else the currently open sheet.
  const sheet = sheetId ? await DailySheet.findById(sheetId) : await findActiveSheet(conn);

  if (!sheet) {
    return NextResponse.json(
      { error: 'NO_SHEET', message: 'No daily sheet found to close.' },
      { status: 404 },
    );
  }

  // Idempotent: closing an already-closed sheet is a no-op success.
  if (sheet.isPosted) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }

  // Finalize totals (combined + per-method) from the authoritative arrays, then
  // mark posted. persist also rolls the final figures into the month.
  await persistDailyTotalsAndSync(DailySheet, sheet._id);
  await DailySheet.updateOne({ _id: sheet._id }, { $set: { isPosted: true } });

  return NextResponse.json({ ok: true });
}
