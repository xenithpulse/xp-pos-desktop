// app/api/cash-slips/isSigned/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { extractId } from '@/utils/extractID';


export async function PUT(req: NextRequest) {
  const roleCheckResponse = await isAdminRequest({ requiredRole: 'super_admin'});
  if (roleCheckResponse) return roleCheckResponse;

  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);
  
  try {
    const id = extractId(req, 4);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid or missing ID in URL' }, { status: 400 });
    }

    const { signedByCEO }: { signedByCEO: unknown } = await req.json();

    if (typeof signedByCEO !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid input: signedByCEO must be a boolean.' },
        { status: 400 }
      );
    }

    const updatedCashSlip = await CashSlip.findByIdAndUpdate(
      new mongoose.Types.ObjectId(id),
      { signedByCEO },
      { new: true, runValidators: true }
    );

    if (!updatedCashSlip) {
      return NextResponse.json({ error: 'Cash Slip not found.' }, { status: 404 });
    }

    return NextResponse.json(updatedCashSlip, { status: 200 });
  } catch (error) {
    console.error('Error updating cash slip signed status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
