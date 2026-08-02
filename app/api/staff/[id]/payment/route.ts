// app/api/staff/[id]/payment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { mongooseConnect } from "@/lib/mongoose";
import { extractId } from "@/utils/extractID";
import { StaffModel } from "@/models/factories/Staff";
import { PaymentType } from "@/models/schemas/staff.schema";

export async function POST(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const Staff = StaffModel(conn);
    const id = extractId(req, 3);
    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
    }

    const body: { type?: string; amount?: number; note?: string } = await req.json();
    const { type, amount, note } = body;

    if (!type || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid fields: type and amount" },
        { status: 400 }
      );
    }

    const staff = await Staff.findById(id);
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const validTypes: PaymentType[] = ["advance", "partial", "salary", "advance_deduction", "cycle_settlement"];

    if (!type || !validTypes.includes(type as PaymentType)) {
      return NextResponse.json(
        { error: "Invalid payment type. Valid types: advance, partial, salary" },
        { status: 400 }
      );
    }

    const paymentType = type as PaymentType;

    // Get effective salary info before payment
    const beforeInfo = staff.getEffectiveSalary();

    // Record the payment with auto cycle advancement
    const { payment, cyclesAdvanced } = await staff.recordPayment({
      type: paymentType,
      amount,
      note,
      autoAdvanceCycle: paymentType !== "advance", // Don't auto-advance for advances
    });

    // Get updated staff and effective info
    const updatedStaff = await Staff.findById(id);
    const afterInfo = updatedStaff?.getEffectiveSalary();

    return NextResponse.json(
      {
        message: cyclesAdvanced > 0
          ? `Payment recorded. ${cyclesAdvanced} salary cycle(s) settled and advanced.`
          : "Payment recorded successfully.",
        payment,
        cyclesAdvanced,
        staff: updatedStaff,
        summary: {
          baseSalary: staff.salary,
          beforePayment: {
            effectiveSalary: beforeInfo.effectiveSalary,
            monthsOverdue: beforeInfo.monthsOverdue,
            multiplier: beforeInfo.multiplier,
          },
          afterPayment: {
            effectiveSalary: afterInfo?.effectiveSalary || 0,
            monthsOverdue: afterInfo?.monthsOverdue || 0,
            multiplier: afterInfo?.multiplier || 1,
            totalPaid: updatedStaff?.totalPaid || 0,
            effectiveRemaining: Math.max(0, (afterInfo?.effectiveSalary || 0) - (updatedStaff?.totalPaid || 0)),
          },
          pendingAdvance: updatedStaff?.pendingAdvance || 0,
          isSalaryPaid: updatedStaff?.isSalaryPaid || false,
          nextDueDate: updatedStaff?.salaryDueDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Payment POST error:", errMessage);
    return NextResponse.json(
      { error: "Failed to record payment", details: errMessage },
      { status: 500 }
    );
  }
}

// GET: Get payment history for a staff member
export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const Staff = StaffModel(conn);
    const id = extractId(req, 3);

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid staff id" }, { status: 400 });
    }

    const staff = await Staff.findById(id);
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Sort payments by date descending (newest first)
    const payments = [...staff.payments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Group payments by type for summary
    const summary = {
      totalAdvance: payments
        .filter((p) => p.type === "advance")
        .reduce((sum, p) => sum + p.amount, 0),
      totalPartial: payments
        .filter((p) => p.type === "partial")
        .reduce((sum, p) => sum + p.amount, 0),
      totalSalary: payments
        .filter((p) => p.type === "salary")
        .reduce((sum, p) => sum + p.amount, 0),
      totalAdvanceDeducted: payments
        .filter((p) => p.type === "advance_deduction")
        .reduce((sum, p) => sum + p.amount, 0),
      cycleSettlements: payments.filter((p) => p.type === "cycle_settlement").length,
      totalPayments: payments.length,
      pendingAdvance: staff.pendingAdvance || 0,
    };

    const effectiveInfo = staff.getEffectiveSalary();

    return NextResponse.json({
      staffId: staff._id,
      staffName: staff.name,
      payments,
      summary,
      currentCycle: {
        baseSalary: staff.salary,
        effectiveSalary: effectiveInfo.effectiveSalary,
        multiplier: effectiveInfo.multiplier,
        monthsOverdue: effectiveInfo.monthsOverdue,
        totalPaid: staff.totalPaid,
        remaining: Math.max(0, effectiveInfo.effectiveSalary - staff.totalPaid),
        dueDate: staff.salaryDueDate,
        originalDueDay: staff.originalDueDay,
        isSalaryPaid: staff.isSalaryPaid,
      },
    });
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Payment GET error:", errMessage);
    return NextResponse.json(
      { error: "Failed to fetch payment history", details: errMessage },
      { status: 500 }
    );
  }
}
