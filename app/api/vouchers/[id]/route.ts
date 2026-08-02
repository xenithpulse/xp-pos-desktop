import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { extractId } from "@/utils/extractID";
import { VoucherModel } from "@/models/factories/Voucher";
import { mongooseConnect } from "@/lib/mongoose";

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const Voucher = VoucherModel(conn);
    const id = extractId(req, 3);
    
    if (!id) {
      return NextResponse.json({ error: "Missing id in path" }, { status: 400 });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
    }

    const voucher = await Voucher.findById(id).lean();
    if (!voucher) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(voucher, { status: 200 });
  } catch (err) {
    console.error("GET /api/vouchers/:id error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PUT: Update voucher by ID
export async function PUT(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const Voucher = VoucherModel(conn);
    const id = extractId(req, 3);

    if (!id) {
      return NextResponse.json({ error: "Missing id in path" }, { status: 400 });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
    }

    const data = await req.json().catch(() => ({}));
    // you may want to whitelist fields from `data` here

    const updated = await Voucher.findByIdAndUpdate(id, data, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("PUT /api/vouchers/:id error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE: Delete voucher by ID (no typed second param to avoid ParamCheck error)
export async function DELETE(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const Voucher = VoucherModel(conn);
    const id = extractId(req, 3);

    if (!id) {
      return NextResponse.json({ message: "Missing voucher id" }, { status: 400 });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ message: "Invalid voucher id format" }, { status: 400 });
    }

    const deleted = await Voucher.findByIdAndDelete(id).lean();
    if (!deleted) {
      console.log("DELETE: voucher not found:", id);
      return NextResponse.json({ message: "Voucher not found" }, { status: 404 });
    }

    console.log("DELETE: voucher deleted:", deleted);
    return NextResponse.json({ success: true, deleted }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/vouchers/:id error:", error);
    return NextResponse.json({ message: "Failed to delete voucher." }, { status: 500 });
  }
}
