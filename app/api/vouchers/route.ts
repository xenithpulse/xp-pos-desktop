import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { getManualVoucherNumber } from "@/lib/helpers/getManualVoucherNum";
import { VoucherModel } from "@/models/factories/Voucher";
import { isAdminRequest } from "@/lib/auth";

type StringRegexQuery = { 
    $regex: RegExp; 
};

type VoucherSearchFilter = {
    description?: StringRegexQuery;
    uniqueNumber?: StringRegexQuery;
    copyNumber?: StringRegexQuery;
};

interface VoucherQuery {
    $or?: VoucherSearchFilter[];
}

export async function GET(req: Request) {
    const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
    if (authResult) return authResult;
    const conn = await mongooseConnect();
    const Voucher = VoucherModel(conn);
    try {
        const { searchParams } = new URL(req.url);

        // --- Pagination Parameters ---
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const skip = (page - 1) * limit;

        // --- Search Parameter ---
        const search = searchParams.get('search') || '';

        // --- Query Construction ---
        // Use the strictly defined interface for the query object.
        const query: VoucherQuery = {};

        // If a search term exists, apply search filters
        if (search) {
            const searchRegex = new RegExp(search, 'i'); // Case-insensitive regex search
            query.$or = [
                { description: { $regex: searchRegex } },
                { uniqueNumber: { $regex: searchRegex } },
                { copyNumber: { $regex: searchRegex } },
            ];
        }

        // 1. Get total count of documents matching the search query
        const totalVouchersCount = await Voucher.countDocuments(query);
        const totalPages = Math.ceil(totalVouchersCount / limit);

        // 2. Fetch the paginated and filtered vouchers
        const vouchers = await Voucher.find(query)
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip(skip) // Skip records for pagination
            .limit(limit) // Limit records per page
            .lean(); // Faster query execution

        return NextResponse.json({
            vouchers,
            totalCount: totalVouchersCount,
            totalPages,
            currentPage: page,
            limit,
        });
    } catch (error) {
        console.error("Voucher GET API error:", error);
        
        let errorMessage = "An unknown error occurred.";
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error) {
            errorMessage = String(error.message);
        }

        return NextResponse.json(
            { error: "Failed to fetch vouchers", details: errorMessage },
            { status: 500 }
        );
    }
}

interface VoucherPostData {
    amount: number; 
    description: string; 
    expenseEntry?: string;
    postedAt?: Date;
    postedBy?: string;
}

interface VoucherNumberInfo {
    copyNumber: string;
    uniqueNumber: string;
}

interface VoucherConfigError {
    requiresNewConfig: boolean;
    message: string;
}

function isConfigError(info: VoucherNumberInfo | VoucherConfigError): info is VoucherConfigError {
    return (info as VoucherConfigError).requiresNewConfig !== undefined;
}


export async function POST(req: Request) {
    try {
        const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
        if (authResult) return authResult;
        const conn = await mongooseConnect();
        const Voucher = VoucherModel(conn);
        const data: VoucherPostData = await req.json();
        const { amount, description, expenseEntry, postedAt, postedBy } = data;

        const voucherInfo = await getManualVoucherNumber();

        if (!amount || !description) {
            return NextResponse.json({ error: "Amount and description are required." }, { status: 400 });
        }

        if (isConfigError(voucherInfo)) {
            return NextResponse.json({
                error: voucherInfo.message,
                requiresNewConfig: true,
            }, { status: 400 });
        }

        const { copyNumber, uniqueNumber } = voucherInfo as VoucherNumberInfo // We can assert here since the type guard passed

        const voucher = await Voucher.create({
            copyNumber,
            uniqueNumber,
            amount,
            description,
            expenseEntry,
            postedAt,
            postedBy
        });

        return NextResponse.json(voucher);
    } catch (error) {
        let errorMessage = "An unknown error occurred.";
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null && 'message' in error) {
            errorMessage = String(error.message);
        }

        return NextResponse.json(
            { error: "Failed to create Voucher", details: errorMessage },
            { status: 500 }
        );
    }
}