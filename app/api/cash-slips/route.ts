// app\api\cash-slips\route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";

export async function GET() {
  try {
      const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
      if (authResult) return authResult;
      const conn = await mongooseConnect();
      const CashSlip = CashSlipModel(conn);
      const slips = await CashSlip.find().sort({ createdAt: -1 });
    return NextResponse.json(slips);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch cash slips", details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
    if (authResult) return authResult;
    const conn = await mongooseConnect();
    const CashSlip = CashSlipModel(conn);
    const { amount, description,  copyNumber, uniqueNumber, paymentMethod, createdBy } = await req.json();

    if (!amount || !description) {
      return NextResponse.json({ error: "Missing amount or description" }, { status: 400 });
    }

    const slip = await CashSlip.create({
      copyNumber,
      uniqueNumber,
      amount,
      description,
      paymentMethod,
      createdBy
    });

    return NextResponse.json(slip);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create slip", details: (error as Error).message },
      { status: 500 }
    );
  }
}
