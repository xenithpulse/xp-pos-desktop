import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { extractId } from "@/utils/extractID";
import { StaffModel } from "@/models/factories/Staff";

// -------------------- GET: Get staff by ID --------------------
export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const id = extractId(req, 3);
    const Staff = StaffModel(conn);
    const staff = await Staff.findById(id);

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Include effective salary info in response
    const effectiveInfo = staff.getEffectiveSalary();
    const response = {
      ...staff.toJSON(),
      effectiveSalaryInfo: effectiveInfo,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("GET staff error:", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

// -------------------- PUT: Update staff or record payments --------------------
export async function PUT(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const id = extractId(req, 3);
    const Staff = StaffModel(conn);
    const data = await req.json();

    const staff = await Staff.findById(id);
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // --- Input Validation ---
    if (data.salary !== undefined && (typeof data.salary !== 'number' || data.salary < 1)) {
      return NextResponse.json({ error: "Salary must be a positive number" }, { status: 400 });
    }
    if (data.payment?.amount !== undefined && (typeof data.payment.amount !== 'number' || data.payment.amount <= 0)) {
      return NextResponse.json({ error: "Payment amount must be a positive number" }, { status: 400 });
    }
    if (data.payment?.amount > 100000000) {
      return NextResponse.json({ error: "Payment amount exceeds maximum limit" }, { status: 400 });
    }

    // --- General updates ---
    if (data.name) staff.name = data.name;
    if (data.jobTitle) staff.jobTitle = data.jobTitle;
    if (data.salary) staff.salary = data.salary;
    if (data.salaryDueDate) {
      staff.salaryDueDate = new Date(data.salaryDueDate);
      // Update originalDueDay if explicitly changing due date (use UTC)
      staff.originalDueDay = new Date(data.salaryDueDate).getUTCDate();
    }
    if (data.remarks) staff.remarks = data.remarks;

    // --- Payment Handling (partial payment) ---
    if (data.payment && data.payment.amount > 0) {
      const paymentType = data.payment.type || "partial";
      const amount = Number(data.payment.amount);
      const note = data.payment.note || "";

      const { payment, cyclesAdvanced } = await staff.recordPayment({
        type: paymentType,
        amount,
        note,
        autoAdvanceCycle: true, // Auto-advance if full month(s) paid
      });

      const updatedStaff = await Staff.findById(id);
      const effectiveInfo = updatedStaff?.getEffectiveSalary();

      return NextResponse.json({
        staff: updatedStaff,
        payment,
        cyclesAdvanced,
        message: cyclesAdvanced > 0
          ? `Payment recorded. ${cyclesAdvanced} salary cycle(s) advanced.`
          : "Payment recorded successfully.",
        effectiveSalaryInfo: effectiveInfo,
      });
    }

    // --- Full Settlement (Mark Salary Paid) ---
    if (data.markSalaryPaid === true) {
      const effectiveInfo = staff.getEffectiveSalary();
      const settlementResult = await staff.settleFullAmount(
        data.settlementNote || "Salary settled"
      );

      const updatedStaff = await Staff.findById(id);
      const newEffectiveInfo = updatedStaff?.getEffectiveSalary();

      return NextResponse.json({
        staff: updatedStaff,
        settlement: {
          advanceDeducted: settlementResult.advanceDeducted,
          salaryPaid: settlementResult.salaryPaid,
          cyclesSettled: settlementResult.cyclesSettled,
          totalPayments: settlementResult.payments.length,
          previousMonthsOverdue: effectiveInfo.monthsOverdue,
          currentMonthsOverdue: newEffectiveInfo?.monthsOverdue || 0,
          message: settlementResult.cyclesSettled > 0
            ? `Settled ${settlementResult.cyclesSettled} month(s). ${settlementResult.advanceDeducted > 0 ? `Advance of ${settlementResult.advanceDeducted} deducted. ` : ""}Net salary: ${settlementResult.salaryPaid}`
            : "No cycles to settle.",
        },
        effectiveSalaryInfo: newEffectiveInfo,
      });
    }

    await staff.save();
    const updatedStaff = await Staff.findById(id);
    return NextResponse.json(updatedStaff);
  } catch (error) {
    console.error("Error updating staff:", error);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}

// -------------------- DELETE: Remove staff --------------------
export async function DELETE(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const id = extractId(req, 3);
    const Staff = StaffModel(conn);
    const deletedStaff = await Staff.findByIdAndDelete(id);

    if (!deletedStaff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Staff deleted" }, { status: 200 });
  } catch (error) {
    console.error("DELETE staff error:", error);
    return NextResponse.json({ error: "Failed to delete staff" }, { status: 500 });
  }
}
