// lib/helpers/getActiveSlipConfig.ts
import { VoucherConfigModel } from "@/models/factories/VoucherConfig";
import { IVoucherConfig } from "@/models/schemas/voucherConfig.schema";
import { mongooseConnect } from "../mongoose";

export async function getActiveVoucherConfig(): Promise<IVoucherConfig> {
  const conn = await mongooseConnect();
  const VoucherConfig = VoucherConfigModel(conn);
  const latest = await VoucherConfig.findOne().sort({ updatedAt: -1 });
  if (!latest) {
    throw new Error("Voucher configuration not found. Please add it in the system.");
  }
  return latest;
}
