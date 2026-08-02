// app/api/cash-slips/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { SlipConfigModel } from "@/models/factories/SlipConfig";

interface ISlipConfigPlain {
  currentCopyNumber?: string;
  uniqueNumberPrefix?: string;
  start?: number;
  limit?: number;
  updatedAt?: Date | string;
}

/**
 * Build available slots:
 * - Parses prefix into (prefixText, digits)
 * - Computes first = baseNum + (start - 1)  (so start=1 => include baseNum)
 * - Produces limit count codes: prefixText + (first + offset)
 * - Filters out already-used uniqueNumber values for the requested copy
 */
async function getNextSlots(params: {
  copyNumber: string;
  uniqueNumberPrefix: string;
  start: number;
  limit: number;
}): Promise<string[]> {
  const { copyNumber, uniqueNumberPrefix, start, limit } = params;

  if (!copyNumber) throw new Error("copyNumber is required");
  if (!uniqueNumberPrefix) throw new Error("uniqueNumberPrefix is required");
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);
  const used: string[] = await CashSlip.find({ copyNumber }).distinct("uniqueNumber") as string[];

  // 2) split prefix into non-digits + digits at the end
  //    e.g. "A401" -> ["A", "401"], "B12" -> ["B", "12"]
  const m = uniqueNumberPrefix.match(/^(.*?)(\d+)$/);
  if (!m) throw new Error(`Invalid uniqueNumberPrefix "${uniqueNumberPrefix}"`);
  const [, prefixText, digitsStr] = m;
  const baseNum = Number(digitsStr);
  if (Number.isNaN(baseNum)) throw new Error(`Invalid numeric part in prefix "${uniqueNumberPrefix}"`);

  // 3) interpret start: we treat start as 1-based offset where start=1 includes the baseNum.
  //    Convert to zero-based offset to add to baseNum:
  const startIndex = Math.max(0, (typeof start === "number" ? start : 1) - 1);
  const first = baseNum + startIndex; // e.g. baseNum=401, start=1 => first=401

  const slots: string[] = [];
  for (let offset = 0; offset < limit; offset++) {
    const n = first + offset; // 401, 402, 403...
    const code = `${prefixText}${n}`;
    if (!used.includes(code)) slots.push(code);
  }

  // server-side debug (visible only in server logs)
  console.debug(`[slots] copy=${copyNumber} prefix=${uniqueNumberPrefix} start=${start} ->`, slots);

  return slots;
}

export async function GET(req: NextRequest) {
  await mongooseConnect();
  const conn = await mongooseConnect();
  const SlipConfig = SlipConfigModel(conn);
  try {
    const url = req.nextUrl;
    const copyQuery = url.searchParams.get("copy") ?? undefined;

    // latest config
    const latest = (await SlipConfig.findOne().sort({ updatedAt: -1 }).lean()) as ISlipConfigPlain | null;
    if (!latest) {
      return NextResponse.json({ error: "No slip config found" }, { status: 404 });
    }

    const copyToUse = copyQuery ?? latest.currentCopyNumber;
    if (!copyToUse) {
      return NextResponse.json({ error: "No copy number available to generate slots." }, { status: 400 });
    }

    const prefix = latest.uniqueNumberPrefix ?? "";
    const start = typeof latest.start === "number" ? latest.start : 1;
    const limit = typeof latest.limit === "number" ? latest.limit : 20;

    const slots = await getNextSlots({
      copyNumber: copyToUse,
      uniqueNumberPrefix: prefix,
      start,
      limit,
    });

    // gather all known copyNumbers from SlipConfig collection
    const allConfigs = (await SlipConfig.find().sort({ updatedAt: -1 }).lean()) as ISlipConfigPlain[] | null;
    const copyNumbers = Array.from(
      new Set(
        (allConfigs && allConfigs.length > 0
          ? allConfigs.map((c) => c.currentCopyNumber).filter(Boolean)
          : [latest.currentCopyNumber]
        )
      )
    );

    if (latest.currentCopyNumber && !copyNumbers.includes(latest.currentCopyNumber)) {
      copyNumbers.unshift(latest.currentCopyNumber);
    }

    return NextResponse.json({
      copyNumbers,
      availableSlots: slots,
    });
  } catch (err) {
    console.error("Error in /api/cash-slips/slots:", err);
    return NextResponse.json({ error: "Failed to fetch slots" }, { status: 500 });
  }
}
