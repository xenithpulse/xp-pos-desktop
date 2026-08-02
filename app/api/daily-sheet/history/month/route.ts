import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';

/**
 * GET /api/daily-sheet/history/month
 * Fetch daily sheets for a specific month/year
 * Query params: month (0-11), year (e.g., 2026)
 */
export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');

    // Default to current month if not provided
    const now = new Date();
    const month = monthParam !== null ? parseInt(monthParam, 10) : now.getMonth();
    const year = yearParam !== null ? parseInt(yearParam, 10) : now.getFullYear();

    // Validate params
    if (isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json(
        { error: 'Invalid month parameter. Must be 0-11.' },
        { status: 400 }
      );
    }

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid year parameter.' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    const DailySheet = DailySheetModel(conn);

    // Calculate date range for the month
    const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const sheets = await DailySheet.find({
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    })
      .sort({ date: 1 }) // Ascending for proper opening balance calculation
      .lean();

    return NextResponse.json({
      sheets,
      month,
      year,
      count: sheets.length,
      dateRange: {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString(),
      },
    });
  } catch (error) {
    console.error('[GET /api/daily-sheet/history/month] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monthly daily sheets.' },
      { status: 500 }
    );
  }
}
