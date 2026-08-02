import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { StaffModel } from "@/models/factories/Staff";

// GET: List all staff with effective salary info
export async function GET() {
  try {
    const conn = await mongooseConnect();
    const Staff = StaffModel(conn);
    const staffList = await Staff.find().sort({ createdAt: -1 });

    // Enrich with effective salary calculations
    const enrichedStaff = staffList.map((staff) => {
      const effectiveInfo = staff.getEffectiveSalary();
      const effectiveRemaining = Math.max(0, effectiveInfo.effectiveSalary - staff.totalPaid);

      return {
        ...staff.toJSON(),
        effectiveSalary: effectiveInfo.effectiveSalary,
        salaryMultiplier: effectiveInfo.multiplier,
        monthsOverdue: effectiveInfo.monthsOverdue,
        effectiveRemaining,
        pendingAdvance: staff.pendingAdvance || 0,
        originalDueDay: staff.originalDueDay || new Date(staff.salaryDueDate).getDate(),
      };
    });

    return NextResponse.json(enrichedStaff, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

// POST: Create new staff
export async function POST(req: Request) {
  try {
    const conn = await mongooseConnect();
    const Staff = StaffModel(conn);
    const data = await req.json();

    const staff = await Staff.create(data);
    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create staff" }, { status: 500 });
  }
}
