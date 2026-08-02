// app/api/cash-slips/stats/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { SendToContract } from "@/models/schemas/cashslip.schema";

interface CashSlipLean {
  _id?: string;
  copyNumber?: string;
  uniqueNumber?: string;
  amount?: number;
  description?: string;
  createdAt?: Date | string;
  used?: boolean;
  usedBy?: string | null;
  createdBy?: string | null;
  addedToContract?: SendToContract[] | null;
}

interface SlipSummary {
  _id: string;
  copyNumber?: string;
  uniqueNumber?: string;
  amount?: number;
  description?: string;
  createdAt?: Date | string;
  missingFields: string[];
}

interface CreatorEntry {
  createdBy: string;
  count: number;
  amount: number;
  slips: SlipSummary[];
}

function findMissingFieldsForSlip(slip: CashSlipLean): string[] {
  if (!Array.isArray(slip.addedToContract) || slip.addedToContract.length === 0) {
    return ["addedToContract"];
  }

  const missing = new Set<string>();

  for (const entry of slip.addedToContract) {
    if (!entry) {
      missing.add("addedToContract[*]");
      continue;
    }
    if (!entry.bookingId) missing.add("bookingId");
    if (!entry.clientName) missing.add("clientName");
    if (!entry.bookingUniqueId) missing.add("bookingUniqueId");
    if (!entry.eventTimeAndDate) missing.add("eventTimeAndDate");
    if (!entry.hallArea) missing.add("hallArea");
    if (typeof entry.guest === "undefined" || entry.guest === null) missing.add("guest");
  }

  return Array.from(missing);
}

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const CashSlip = CashSlipModel(conn);
    const url = new URL(req.url);
    const createdByFilter = url.searchParams.get("createdBy") ?? "";

    // Build a typed filter object. Using Record<string, unknown> keeps this typed
    // while allowing us to add fields conditionally.
    const mongoFilter: Record<string, unknown> = {
      $or: [
        { addedToContract: { $exists: false } },
        { addedToContract: { $size: 0 } },
        {
          addedToContract: {
            $elemMatch: {
              $or: [
                { bookingId: { $exists: false } },
                { bookingUniqueId: { $in: [null, ""] } },
                { clientName: { $in: [null, ""] } },
                { eventTimeAndDate: { $in: [null, ""] } },
                { hallArea: { $in: [null, ""] } },
                { guest: { $exists: false } },
              ],
            },
          },
        },
      ],
    };

    if (createdByFilter) {
      // assign explicitly to preserve types
      (mongoFilter as Record<string, unknown>)["createdBy"] = createdByFilter;
    }

    // select only fields we need
    const projection = "_id copyNumber uniqueNumber amount description createdAt used usedBy createdBy addedToContract";

    // run query; cast via unknown -> CashSlipLean[] so TS knows shape
    const raw = await CashSlip.find(mongoFilter).select(projection).lean().exec();
    const slips = (raw as unknown) as CashSlipLean[];

    // Group by createdBy
    const perCreatorMap = new Map<string, CreatorEntry>();

    for (const slip of slips) {
      const missingFields = findMissingFieldsForSlip(slip);
      // normalize creator label
      const creator = slip.createdBy ?? "unknown";

      const existing = perCreatorMap.get(creator);
      const slipSummary: SlipSummary = {
        _id: String(slip._id ?? ""),
        copyNumber: slip.copyNumber,
        uniqueNumber: slip.uniqueNumber,
        amount: slip.amount,
        description: slip.description,
        createdAt: slip.createdAt,
        missingFields,
      };

      if (!existing) {
        perCreatorMap.set(creator, {
          createdBy: creator,
          count: 1,
          amount: typeof slip.amount === "number" ? slip.amount : 0,
          slips: [slipSummary],
        });
      } else {
        existing.count += 1;
        existing.amount += typeof slip.amount === "number" ? slip.amount : 0;
        existing.slips.push(slipSummary);
      }
    }

    const perCreator = Array.from(perCreatorMap.values()).sort((a, b) => b.amount - a.amount);
    const totalUnlinkedCount = slips.length;
    const totalUnlinkedAmount = perCreator.reduce((sum, cur) => sum + cur.amount, 0);

    const forUser = createdByFilter
      ? perCreator.find((p) => p.createdBy === createdByFilter) ?? { createdBy: createdByFilter, count: 0, amount: 0, slips: [] }
      : null;

    return NextResponse.json({
      ok: true,
      totalUnlinkedCount,
      totalUnlinkedAmount,
      perCreator,
      forUser,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("cash slip stats error:", message);
    return NextResponse.json({ ok: false, error: message || "Unknown error" }, { status: 500 });
  }
}
