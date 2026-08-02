// app/api/cash-slips/manage-unused/mark-used/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { UpdateWriteOpResult, UpdateQuery } from 'mongoose';

interface RequestBody {
  copyNumber?: string;
  copyNumbers?: string[];
  uniqueNumberFrom?: string;
  uniqueNumberTo?: string;
  allFromCopy?: boolean;
  usedBy?: string;
  confirmText: string;
}

interface MarkUsedResult {
    matchedCount: number;
    modifiedCount: number;
    upsertedId?: unknown;
    n?: number;
    nModified?: number;
}

type CopyNumberFilter = { copyNumber: string } | { copyNumber: { $in: string[] } };

type UniqueNumberRangeFilter = {
    uniqueNumber: {
        $gte?: string;
        $lte?: string;
    }
};

type UsedFilter = { used: boolean };

// The final CashSlipFilter is a partial intersection of the possible filter types.
// Mongoose.Filter<T> is typically used, but to guarantee no 'any', we build it explicitly.
type CashSlipFilter = UsedFilter & Partial<CopyNumberFilter & UniqueNumberRangeFilter>;


export async function POST(req: Request) {
  try {
    const authResult = await isAdminRequest({ requiredRole: "super_admin" });
    if (authResult) return authResult;
    const conn = await mongooseConnect();
    const CashSlip = CashSlipModel(conn);
    const body: RequestBody = await req.json();

    if (body.confirmText !== "mark as used") {
      return NextResponse.json(
        { success: false, message: 'Confirmation text must be exactly "mark as used"' },
        { status: 400 }
      );
    }
    const filter: CashSlipFilter = { used: false };


    if (body.copyNumbers && Array.isArray(body.copyNumbers) && body.copyNumbers.length > 0) {
      filter.copyNumber = { $in: body.copyNumbers };
    } else if (body.copyNumber) {
      filter.copyNumber = body.copyNumber;
    }

    if (body.allFromCopy && body.copyNumber) {
    } else if (body.uniqueNumberFrom || body.uniqueNumberTo) {
      const uniqueNumberFilter: UniqueNumberRangeFilter['uniqueNumber'] = {};
      if (body.uniqueNumberFrom) uniqueNumberFilter.$gte = body.uniqueNumberFrom;
      if (body.uniqueNumberTo) uniqueNumberFilter.$lte = body.uniqueNumberTo;
      
      filter.uniqueNumber = uniqueNumberFilter;
    }

    if (!filter.copyNumber && !filter.uniqueNumber) {
      return NextResponse.json(
        { success: false, message: "Provide a filter: copyNumber(s) or uniqueNumberFrom/To" },
        { status: 400 }
      );
    }
    const update: UpdateQuery<unknown> = {
      $set: {
        used: true,
        usedAt: new Date(),
        ...(body.usedBy && { usedBy: body.usedBy }), 
      },
    };

    const res = await CashSlip.updateMany(filter, update) as UpdateWriteOpResult & MarkUsedResult;
    const matchedCount = res.matchedCount ?? res.n ?? 0;
    const modifiedCount = res.modifiedCount ?? res.nModified ?? 0;

    return NextResponse.json(
      {
        success: true,
        matchedCount,
        modifiedCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/cash-slips/mark-used error:", err);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}