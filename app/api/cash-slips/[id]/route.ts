// app/api/cash-slips/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { extractId } from "@/utils/extractID";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { sendNotification } from "@/lib/helpers/notify";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET(req: NextRequest) {
  const id = extractId(req, 3);
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);

  const slip = await CashSlip.findById(id).lean();
  if (!slip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(slip);
}

export async function PUT(req: NextRequest) {
  const id = extractId(req, 3);
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);
  const data = await req.json();

  // Get session for notification
  let userName = "System";
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.name) userName = session.user.name;
  } catch (e) {
    console.warn("Could not get session in cash-slip PUT route", e);
  }

  // Fetch the original slip for comparison
  const originalSlip = await CashSlip.findById(id).lean();
  if (!originalSlip) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await CashSlip.findByIdAndUpdate(id, data, { new: true }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build change details for notification
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  
  if (data.amount !== undefined && data.amount !== originalSlip.amount) {
    changes.push({
      field: "amount",
      oldValue: String(originalSlip.amount),
      newValue: String(data.amount),
    });
  }
  if (data.description !== undefined && data.description !== originalSlip.description) {
    changes.push({
      field: "description",
      oldValue: originalSlip.description || "-",
      newValue: data.description || "-",
    });
  }
  if (data.paymentMethod !== undefined && data.paymentMethod !== originalSlip.paymentMethod) {
    changes.push({
      field: "paymentMethod",
      oldValue: originalSlip.paymentMethod || "-",
      newValue: data.paymentMethod || "-",
    });
  }
  if (data.signedByCEO !== undefined && data.signedByCEO !== originalSlip.signedByCEO) {
    changes.push({
      field: "signedByCEO",
      oldValue: originalSlip.signedByCEO ? "Yes" : "No",
      newValue: data.signedByCEO ? "Yes" : "No",
    });
  }
  if (data.used !== undefined && data.used !== originalSlip.used) {
    changes.push({
      field: "used",
      oldValue: originalSlip.used ? "Yes" : "No",
      newValue: data.used ? "Yes" : "No",
    });
  }

  // Only send notification if there were actual changes
  if (changes.length > 0) {
    const changesSummary = changes.map((c) => `${c.field}: ${c.oldValue} → ${c.newValue}`).join(", ");
    
    await sendNotification({
      message: `Cash slip ${originalSlip.copyNumber}/${originalSlip.uniqueNumber} updated — ${changesSummary}`,
      type: "info",
      resource: "cash_slip",
      resourceId: id,
      action: "updated",
      createdBy: userName,
      recipients: ["all"],
      details: changes,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const id = extractId(req, 3);
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);

  try {
    await CashSlip.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating menu item:', error);
    return NextResponse.json(
      { message: 'Failed to update menu item', error: (error as Error).message },
      { status: 500 }
    );
  }
}
