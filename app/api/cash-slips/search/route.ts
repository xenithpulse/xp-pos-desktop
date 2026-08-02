// app/api/cash-slips/search/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { CashSlipModel } from "@/models/factories/CashSlip";

function safeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface CashSlipLean {
  _id?: string;
  copyNumber?: string;
  uniqueNumber?: string;
  amount?: number;
  description?: string;
  createdAt?: Date | string;
  used?: boolean;
  usedBy?: string | null;
  signedByCEO?: boolean;
  paymentMethod?: string;
  addedToContract?: unknown[] | null;
  createdBy?: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const CashSlip = CashSlipModel(conn);
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const partial = url.searchParams.get("partial") === "true";
    const amountExact = url.searchParams.get("amountExact") === "true";
    const amountStr = url.searchParams.get("amount");
    const amountMinStr = url.searchParams.get("amountMin");
    const amountMaxStr = url.searchParams.get("amountMax");
    const copyNumber = url.searchParams.get("copyNumber") || "";
    const uniqueNumber = url.searchParams.get("uniqueNumber") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") || "20", 10)));
    const sortParam = url.searchParams.get("sort") || "createdAt:desc";

    const filter: Record<string, unknown> = {};

    // Amount filters
    if (amountExact && amountStr) {
      const amountVal = parseFloat(amountStr);
      if (!Number.isNaN(amountVal)) {
        filter.amount = amountVal;
      }
    } else {
      const range: Record<string, number> = {};
      if (amountMinStr) {
        const v = parseFloat(amountMinStr);
        if (!Number.isNaN(v)) range.$gte = v;
      }
      if (amountMaxStr) {
        const v = parseFloat(amountMaxStr);
        if (!Number.isNaN(v)) range.$lte = v;
      }
      if (Object.keys(range).length) {
        filter.amount = range;
      }
    }

    if (copyNumber) filter.copyNumber = copyNumber;
    if (uniqueNumber) filter.uniqueNumber = uniqueNumber;

    if (q) {
      const isNumeric = /^-?\d+(\.\d+)?$/.test(q);
      const or: Array<Record<string, unknown>> = [];

      if (partial) {
        const r = new RegExp(safeRegex(q), "i");
        or.push({ description: { $regex: r } as unknown as Record<string, unknown> });
        or.push({ copyNumber: { $regex: r } as unknown as Record<string, unknown> });
        or.push({ uniqueNumber: { $regex: r } as unknown as Record<string, unknown> });
      } else {
        const r = new RegExp("^" + safeRegex(q) + "$", "i");
        or.push({ copyNumber: { $regex: r } as unknown as Record<string, unknown> });
        or.push({ uniqueNumber: { $regex: r } as unknown as Record<string, unknown> });
        or.push({ description: { $regex: new RegExp(safeRegex(q), "i") } as unknown as Record<string, unknown> });
      }

      if (isNumeric) {
        const num = parseFloat(q);
        if (!Number.isNaN(num)) or.push({ amount: num });
      }

      if (!("$and" in filter)) {
        filter.$and = [];
      }
      const andArr = (filter.$and as Array<Record<string, unknown>> | undefined) ?? [];
      andArr.push({ $or: or });
      filter.$and = andArr;
    }

    const [sortFieldRaw, sortDirRaw] = sortParam.split(":");
    const sortField = sortFieldRaw && sortFieldRaw.length ? sortFieldRaw : "createdAt";
    const sortDir = sortDirRaw === "asc" ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

    const skip = (page - 1) * limit;

    const rawResult = await CashSlip.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const docs = (rawResult as unknown) as CashSlipLean[];

    const total = await CashSlip.countDocuments(filter).exec();

    return NextResponse.json({
      ok: true,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      data: docs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("CashSlip search error:", message);
    return NextResponse.json({ ok: false, error: message || "Unknown error" }, { status: 500 });
  }
}
