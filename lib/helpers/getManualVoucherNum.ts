// app\lib\helpers\getManualVoucherNum.ts 
import { VoucherModel } from "@/models/factories/Voucher";
import { getActiveVoucherConfig } from "./voucherConfig";
import { mongooseConnect } from "../mongoose";

export async function getManualVoucherNumber() {
  const config = await getActiveVoucherConfig();
  const { currentCopyNumber, uniqueNumberPrefix, limit } = config;

  // Split prefix and numeric part from uniqueNumberPrefix
  const prefixMatch = uniqueNumberPrefix.match(/^([A-Za-z]+)(\d+)$/);

  if (!prefixMatch) {
    throw new Error("Invalid uniqueNumberPrefix format. Expected format like 'A29'.");
  }

  const prefix = prefixMatch[1];       // "A"
  const baseNumber = parseInt(prefixMatch[2]); // 29
  const conn = await mongooseConnect();
  const Voucher = VoucherModel(conn);
  // Determine the next number
  const existing = await Voucher.find({ copyNumber: currentCopyNumber })
    .sort({ createdAt: -1 })
    .limit(1);

  let nextIndex = 0;

  if (existing.length > 0) {
    const lastUnique = existing[0].uniqueNumber;

    const lastMatch = lastUnique.match(/^([A-Za-z]+)(\d+)$/);
    if (!lastMatch || lastMatch[1] !== prefix) {
      throw new Error("Last unique number format mismatch with config prefix.");
    }

    const lastNumber = parseInt(lastMatch[2]); // e.g. 29
    nextIndex = lastNumber + 1;
  } else {
    nextIndex = baseNumber;
  }

  // Enforce limit
  if (nextIndex >= baseNumber + limit) {
    return {
      requiresNewConfig: true,
      message: "Slip limit reached. Please set a new Copy Number and Prefix.",
    };
  }

  const uniqueNumber = `${prefix}${nextIndex}`;

  return {
    copyNumber: currentCopyNumber,
    uniqueNumber,
  };
}
