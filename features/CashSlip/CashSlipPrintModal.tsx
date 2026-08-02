// components/CashSlipPrintTemplate.tsx
import React from "react";
import { ICashSlip } from "@/models/schemas/cashslip.schema";

interface CashSlipPrintProps {
  slip: ICashSlip;
}

const CashSlipPrintTemplate = React.forwardRef<HTMLDivElement, CashSlipPrintProps>(
  ({ slip }, ref) => {
    if (!slip) {
      return <div className="p-6 text-red-500">Error: Slip data is missing.</div>;
    }

    let formattedDate = '';
    try {
      formattedDate = new Date(slip.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      formattedDate = 'Invalid Date';
    }

    return (
      // Added 'print-a6-slip' class here
      <div ref={ref} className="p-6 text-black bg-white max-w-sm mx-auto border border-gray-300 shadow-md print:shadow-none print:border-0 print-a6-slip">
        <h2 className="text-center text-xl font-extrabold text-gray-800 mb-4 pb-2 border-b border-gray-200">
          CASH RECEIPT
        </h2>
        <div className="text-sm space-y-2 leading-relaxed">
          <div className="flex justify-between items-center py-1 border-b border-gray-100">
            <strong className="text-gray-700">Receipt No:</strong>
            <span className="font-mono text-gray-900">{slip.uniqueNumber || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-100">
            <strong className="text-gray-700">Copy Type:</strong>
            <span className="text-gray-900">{slip.copyNumber || 'N/A'}</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-gray-100">
            <strong className="text-gray-700">Date & Time:</strong>
            <span className="text-gray-900">{formattedDate}</span>
          </div>
          <div className="py-2">
            <strong className="block text-gray-700 mb-1">Description:</strong>
            <p className="pl-2 text-gray-900 bg-gray-50 p-2 rounded wrap-break-word">
              {slip.description || 'No description provided.'}
            </p>
          </div>
          <div className="flex justify-between items-center py-2 border-t border-b border-gray-200 bg-gray-50 mt-4">
            <strong className="text-lg text-gray-800">Amount:</strong>
            <span className="text-xl font-bold text-green-700">Rs. {slip.amount?.toLocaleString() || '0.00'}</span>
          </div>
        </div>

        <div className="mt-12 pt-4 border-t border-dashed border-gray-300 text-right">
          <div className="inline-block text-center">
            <div className="border-b border-gray-500 pb-1 w-48"></div>
            <div className="text-xs text-gray-600 mt-1">Authorized Signature</div>
          </div>
        </div>

        <div className="text-center text-xs text-gray-500 mt-6 pt-4 border-t border-gray-100">
          Thank you for your business!
        </div>
      </div>
    );
  }
);

CashSlipPrintTemplate.displayName = "CashSlipPrintTemplate";
export default CashSlipPrintTemplate;