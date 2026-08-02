// models/CashSlip.ts
import { Connection, Model } from "mongoose";
import { CashSlipSchema, ICashSlip } from "../schemas/cashslip.schema";

CashSlipSchema.index({ copyNumber: 1, uniqueNumber: 1 }, { unique: true });

// ✅ Add text index for search
CashSlipSchema.index({
  description: "text",
  copyNumber: "text",
  uniqueNumber: "text",
});

export function CashSlipModel(conn: Connection): Model<ICashSlip> {
  return (
    conn.models.CashSlip ||
    conn.model<ICashSlip>("CashSlip", CashSlipSchema)
  );
}
