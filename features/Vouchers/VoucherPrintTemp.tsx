// components/VoucherPrintTemplate.tsx
import React from "react";

interface VoucherPrintProps {
  slip: {
    copyNumber: string;
    uniqueNumber: string;
    amount: number;
    description: string;
    createdAt: string; // ISO 8601 string expected
    voucherType?: string; // Added for more specific voucher types
    // You might want to add fields like:
    // recipientName?: string;
    // issuedBy?: string;
    // expiryDate?: string;
  };
}

const VoucherPrintTemplate = React.forwardRef<
  HTMLDivElement,
  VoucherPrintProps
>(({ slip }, ref) => {
  if (!slip) {
    return <div className="p-4 text-red-500">Error: Voucher data is missing.</div>;
  }

  let formattedDate = "";
  try {
    formattedDate = new Date(slip.createdAt).toLocaleDateString("en-PK", { // Changed to 'en-PK' for Pakistan locale
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    formattedDate = "Invalid Date";
  }

  return (
    // 'print-a6-voucher' class defines A6 size and print-specific styles
    <div
      ref={ref}
      className="p-4 text-black bg-white border border-gray-300 shadow-md print:shadow-none print:border-0 print-a6-voucher"
    >
      <h2 className="text-center text-lg font-bold text-gray-800 mb-3 pb-1 border-b border-gray-200">
        VOUCHER
      </h2>
      <div className="text-xs space-y-1.5 leading-snug">
        <div className="flex justify-between items-center py-0.5 border-b border-gray-100">
          <strong className="text-gray-700">Voucher No:</strong>
          <span className="font-mono text-gray-900">
            {slip.uniqueNumber || "N/A"}
          </span>
        </div>
        <div className="flex justify-between items-center py-0.5 border-b border-gray-100">
          <strong className="text-gray-700">Copy Type:</strong>
          <span className="text-gray-900">{slip.copyNumber || "N/A"}</span>
        </div>
        {slip.voucherType && (
          <div className="flex justify-between items-center py-0.5 border-b border-gray-100">
            <strong className="text-gray-700">Voucher Type:</strong>
            <span className="text-gray-900">{slip.voucherType}</span>
          </div>
        )}
        <div className="flex justify-between items-center py-0.5 border-b border-gray-100">
          <strong className="text-gray-700">Date & Time:</strong>
          <span className="text-gray-900">{formattedDate}</span>
        </div>
        <div className="pt-1.5 pb-1">
          <strong className="block text-gray-700 mb-0.5">Description:</strong>
          <p className="pl-1 text-gray-900 bg-gray-50 p-1 rounded break-words text-2xs">
            {slip.description || "No description provided."}
          </p>
        </div>
        <div className="flex justify-between items-center py-1.5 border-t border-b border-gray-200 bg-gray-50 mt-2">
          <strong className="text-base text-gray-800">Value:</strong>
          <span className="text-lg font-bold text-green-700">
            Rs. {slip.amount?.toLocaleString() || "0.00"}
          </span>
        </div>
      </div>

      <div className="mt-12 pt-3 border-t border-dashed border-gray-300 text-right">
        <div className="inline-block text-center">
          <div className="border-b border-gray-500 pb-1 w-40"></div>
          <div className="text-2xs text-gray-600 mt-0.5">Authorized Signature</div>
        </div>
      </div>

      <div className="text-center text-2xs text-gray-500 mt-4 pt-2 border-t border-gray-100">
        Thank you!
      </div>
    </div>
  );
});

VoucherPrintTemplate.displayName = "VoucherPrintTemplate";
export default VoucherPrintTemplate;