// app/api/cash-slips/fetchPagination/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { QueryMatchStage } from "@/types";

type Query = {
  page?: string | null;
  limit?: string | null;
  copyNumber?: string | null;
  sort?: string | null; // 'asc' | 'desc'
};

export async function GET(request: Request) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);

  try {
    const { searchParams } = new URL(request.url);
    const q: Query = {
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
      copyNumber: searchParams.get("copyNumber"),
      sort: searchParams.get("sort"),
    };

    const page = Math.max(1, Number(q.page) || 1);
    let limit = Number(q.limit) || 10;
    const MAX_LIMIT = 200;
    if (limit < 1) limit = 1;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const sortOrder: 1 | -1 = q.sort === "asc" ? 1 : -1;

    // Explicit filter type
    const filter: QueryMatchStage = {};
    if (q.copyNumber) {
      filter.copyNumber = q.copyNumber;
    }

    const total = await CashSlip.countDocuments(filter);

    const lastPage = Math.max(1, Math.ceil(total / limit));
    const effectivePage = page > lastPage ? lastPage : page;
    const effectiveSkip = (effectivePage - 1) * limit;

    const docs = await CashSlip.find(filter)
      .sort({ createdAt: sortOrder })
      .skip(effectiveSkip)
      .limit(limit)
      .lean()
      .exec();

    const data = docs.map((d) => ({
      ...d,
      _id: String(d._id),
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      usedAt: d.usedAt ? new Date(d.usedAt).toISOString() : null,
    }));

    return NextResponse.json(
      {
        data,
        total,
        page: effectivePage,
        limit,
        lastPage,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/cash-slips/fetchPagination error:", err);
    return NextResponse.json({ error: "Failed to fetch cash slips." }, { status: 500 });
  }
}
