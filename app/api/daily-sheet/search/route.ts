import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';

/**
 * GET /api/daily-sheet/search
 * Search daily sheets by query string
 * Query params:
 *   - q: search query (required)
 *   - limit: max results (default 50)
 *   - offset: pagination offset (default 0)
 *   - month: optional filter by month (0-11)
 *   - year: optional filter by year
 */
export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const monthParam = searchParams.get('month');
    const yearParam = searchParams.get('year');

    if (!query) {
      return NextResponse.json(
        { error: 'Search query (q) is required.' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    const DailySheet = DailySheetModel(conn);

    // Build the search filter
    const searchRegex = new RegExp(query, 'i');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseFilter: any = {
      $or: [
        { notes: searchRegex },
        { 'entries.category': searchRegex },
        { 'entries.description': searchRegex },
        { 'slipEntries.description': searchRegex },
        { 'slipEntries.copyNumber': searchRegex },
        { 'slipEntries.uniqueNumber': searchRegex },
      ],
    };

    // Optional month/year filter
    if (monthParam !== null && yearParam !== null) {
      const month = parseInt(monthParam, 10);
      const year = parseInt(yearParam, 10);

      if (!isNaN(month) && !isNaN(year) && month >= 0 && month <= 11) {
        const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
        baseFilter.date = { $gte: startOfMonth, $lte: endOfMonth };
      }
    }

    // Execute search with pagination
    const [sheets, total] = await Promise.all([
      DailySheet.find(baseFilter)
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      DailySheet.countDocuments(baseFilter),
    ]);

    return NextResponse.json({
      sheets,
      total,
      query,
      limit,
      offset,
      hasMore: offset + sheets.length < total,
    });
  } catch (error) {
    console.error('[GET /api/daily-sheet/search] Error:', error);
    return NextResponse.json(
      { error: 'Search failed.' },
      { status: 500 }
    );
  }
}
