// app/api/cash-slips/unused-slips/route.ts
//
// Server-paginated list of UNUSED cash slips for the Daily Sheet "Unused Slips"
// panel. Supports a single unified `q` search matched against slip/copy number,
// payment method, description, linked-booking fields, ObjectId, and exact amount.
import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { CashSlipModel } from '@/models/factories/CashSlip';
import { Types } from 'mongoose';

/** Escape user input so it's a literal in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SlipFilter = { used: boolean; $or?: Record<string, unknown>[] };

export async function GET(request: Request) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    let limit = Number(searchParams.get('limit')) || 10;
    if (limit < 1) limit = 1;
    if (limit > 100) limit = 100;
    const q = (searchParams.get('q') || '').trim();

    // Only unused slips.
    const filter: SlipFilter = { used: false };

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const or: Record<string, unknown>[] = [
        { uniqueNumber: rx },
        { copyNumber: rx },
        { paymentMethod: rx },
        { description: rx },
        { 'addedToContract.bookingUniqueId': rx },
        { 'addedToContract.clientName': rx },
        { 'addedToContract.hallArea': rx },
      ];
      if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
      const amt = Number(q);
      if (q !== '' && Number.isFinite(amt)) or.push({ amount: amt });
      filter.$or = or;
    }

    const total = await CashSlip.countDocuments(filter);
    const lastPage = Math.max(1, Math.ceil(total / limit));
    const effectivePage = Math.min(page, lastPage);
    const skip = (effectivePage - 1) * limit;

    const docs = await CashSlip.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const data = docs.map((d) => ({
      _id: String(d._id),
      uniqueNumber: d.uniqueNumber ?? '',
      copyNumber: d.copyNumber ?? '',
      amount: Number(d.amount) || 0,
      paymentMethod: d.paymentMethod ?? 'cash',
      description: d.description ?? '',
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      signedByCEO: Boolean(d.signedByCEO),
      addedToContract: Array.isArray(d.addedToContract)
        ? d.addedToContract.map((b) => ({
            bookingId: b?.bookingId ? String(b.bookingId) : undefined,
            clientName: b?.clientName ?? '',
            bookingUniqueId: b?.bookingUniqueId ?? '',
            eventTimeAndDate: b?.eventTimeAndDate ?? '',
            hallArea: b?.hallArea ?? '',
            guest: Number(b?.guest ?? 0),
          }))
        : [],
    }));

    const paymentMethods = (await CashSlip.distinct('paymentMethod', { used: false })).filter(
      (m): m is string => typeof m === 'string' && m.length > 0,
    );

    return NextResponse.json(
      { data, total, page: effectivePage, limit, lastPage, paymentMethods },
      { status: 200 },
    );
  } catch (err) {
    console.error('GET /api/cash-slips/unused-slips error:', err);
    return NextResponse.json({ error: 'Failed to fetch unused slips.' }, { status: 500 });
  }
}
