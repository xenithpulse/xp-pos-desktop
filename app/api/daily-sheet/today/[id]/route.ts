// app/api/daily-sheet/today/[id]/route.ts
//
// Bulk update of a daily sheet by id — used by the client's expense-sync
// fallback path (multiple new entries / complex merge). Entries and openings
// from the body are applied, then totals are recomputed authoritatively
// server-side (the client's totals are ignored) and rolled up to the month.
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { extractId } from '@/utils/extractID';
import { persistDailyTotalsAndSync } from '@/utils/dailySheetPersist';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function ts() {
  return new Date().toISOString();
}

export async function PUT(req: NextRequest) {
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  try {
    const id = extractId(req, 4);
    if (!id) {
      return NextResponse.json({ error: 'ID missing in URL' }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    const sheet = await DailySheet.findById(id);
    if (!sheet) {
      return NextResponse.json({ error: 'DailySheet not found' }, { status: 404 });
    }

    // Apply the client-supplied arrays / openings. Totals are deliberately NOT
    // taken from the body — persistDailyTotalsAndSync recomputes them.
    // sheet.set() casts plain objects into the DocumentArray subdoc shape.
    if (Array.isArray(body.entries)) {
      sheet.set('entries', body.entries);
    }
    if (Array.isArray(body.slipEntries)) {
      sheet.set('slipEntries', body.slipEntries);
    }
    if (body.openingBalance != null) sheet.openingBalance = num(body.openingBalance);
    if (body.cashOpeningBalance != null) sheet.cashOpeningBalance = num(body.cashOpeningBalance);
    if (body.onlineOpeningBalance != null) sheet.onlineOpeningBalance = num(body.onlineOpeningBalance);
    if (typeof body.notes === 'string') sheet.notes = body.notes;

    await sheet.save();

    const persisted = await persistDailyTotalsAndSync(DailySheet, id);
    return NextResponse.json(persisted?.doc ?? sheet);
  } catch (error) {
    console.error(`[${ts()}] [daily-sheet today PUT] Error updating DailySheet:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
