import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);
  
  const usedParam = req.nextUrl.searchParams.get('used');
  const used = usedParam === 'true';

  const slips = await CashSlip.find({ used });
  return NextResponse.json(slips);
}
