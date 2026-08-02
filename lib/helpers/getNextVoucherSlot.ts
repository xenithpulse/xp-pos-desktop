// app/lib/helpers/getNextVoucherSlots.ts
import { VoucherModel } from "@/models/factories/Voucher";
import { IVoucherConfig } from "@/models/schemas/voucherConfig.schema";
import { mongooseConnect } from "../mongoose";

export async function getNextSlots(config: IVoucherConfig): Promise<string[]> {
  // 1) fetch already-used uniqueNumbers for this copy
  const conn = await mongooseConnect();
  const Voucher = VoucherModel(conn);
  const used = await Voucher.find({ copyNumber: config.currentCopyNumber })
    .distinct("uniqueNumber");

  // 2) split your "A4" into letter + baseNum
  const m = config.uniqueNumberPrefix.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) throw new Error(`Invalid uniqueNumberPrefix "${config.uniqueNumberPrefix}"`);
  const [, letterPart, baseNumStr] = m;
  const baseNum = Number(baseNumStr);

  // 3) build exactly limit+1 slots, starting at baseNum*10 + start
  const slots: string[] = [];
  const count = (config.limit - 1) + 1;             // e.g. 21
  const first = baseNum * 10 + config.start;   // e.g. 40 + 1 = 41
  for (let offset = 0; offset < count; offset++) {
    const suffix = first + offset;             // 41, 42, …, 61
    const code = `${letterPart}${suffix}`;     // "A41" … "A61"
    if (!used.includes(code)) {
      slots.push(code);
    }
  }

  return slots;
}
