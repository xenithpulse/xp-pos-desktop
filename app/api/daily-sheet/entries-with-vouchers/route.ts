// /app/api/daily-sheet/entries-with-vouchers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { IDailySheet, IExpenseEntry } from '@/models/schemas/dailySheet.schema';
import { VoucherModel } from '@/models/factories/Voucher';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { IVoucher } from '@/models/schemas/voucher.schema';

interface IEnhancedEntry extends IExpenseEntry {
  voucherRef: {
    _id: string;
    copyNumber: string;
    uniqueNumber: string;
    amount: number;
  } | null;
  sanity: boolean; // true if postedCopyNumber, postedUniqueNumber, expID all match a voucher
}

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const DailySheet = DailySheetModel(conn);
    const Voucher = VoucherModel(conn); 
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    let startDate: Date, endDate: Date;

    if (dateParam) {
      const date = new Date(dateParam);
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    // Fetch daily sheet for the given date
    const sheetDoc = await DailySheet.findOne({
      date: { $gte: startDate, $lte: endDate },
    }).lean<IDailySheet>();

    if (!sheetDoc) {
      return NextResponse.json({ message: 'No DailySheet found for this date', entries: [] }, { status: 404 });
    }

    // Fetch vouchers linked to this sheet's entries
    const vouchersDoc = await Voucher.find({
    expenseEntry: sheetDoc._id,
    }).lean<IVoucher[]>(); // <-- ensure this is typed as an array

    // Map vouchers to expense entries with sanity check
    const entriesWithVoucher: IEnhancedEntry[] = sheetDoc.entries.map((entry) => {
    const voucher = vouchersDoc.find((v: IVoucher) => entry.expID && String(v._id) === String(entry.expID));
    const sanity =
        !!voucher &&
        voucher.copyNumber === entry.postedCopyNumber &&
        voucher.uniqueNumber === entry.postedUniqueNumber &&
        String(voucher._id) === String(entry.expID);

    return {
        ...entry,
        voucherRef: voucher
        ? {
            _id: String(voucher._id),
            copyNumber: voucher.copyNumber,
            uniqueNumber: voucher.uniqueNumber,
            amount: voucher.amount,
            }
        : null,
        sanity,
    };
    });

    return NextResponse.json({
      date: sheetDoc.date,
      totalExpense: sheetDoc.totalExpense,
      totalIncome: sheetDoc.totalIncome,
      closingBalance: sheetDoc.closingBalance,
      entries: entriesWithVoucher,
      vouchers: vouchersDoc,
    });
  } catch (err) {
    console.error('Failed to fetch daily sheet entries with vouchers:', err);
    return NextResponse.json({ message: 'Internal server error', error: String(err) }, { status: 500 });
  }
}