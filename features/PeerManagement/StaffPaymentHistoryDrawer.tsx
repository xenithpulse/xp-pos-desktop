"use client";

import React from "react";
import { motion } from "framer-motion";

interface IPayment {
  _id?: string;
  type: "advance" | "partial" | "salary" | "advance_deduction";
  amount: number;
  date: string;
  note?: string;
  cycleMonth?: number;
  effectiveSalary?: number;
}

const formatCurrency = (amount: number): string => {
  return `PKR ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const getPaymentTypeStyle = (type: string) => {
  switch (type) {
    case "advance":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "partial":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "salary":
      return "bg-green-100 text-green-800 border-green-300";
    case "advance_deduction":
      return "bg-purple-100 text-purple-800 border-purple-300";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
};

const getPaymentTypeLabel = (type: string) => {
  switch (type) {
    case "advance":
      return "Advance";
    case "partial":
      return "Partial Payment";
    case "salary":
      return "Salary Payment";
    case "advance_deduction":
      return "Advance Deducted";
    default:
      return type;
  }
};

export default function StaffPaymentHistoryDrawer({
  open,
  onClose,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  staff: {
    name: string;
    payments?: IPayment[];
    totalPaidToDate?: number;
    pendingAdvance?: number;
    salary?: number;
    effectiveSalary?: number;
    salaryMultiplier?: number;
  };
}) {
  // Calculate summary
  const payments = staff.payments || [];
  const totalAdvance = payments
    .filter((p) => p.type === "advance")
    .reduce((sum, p) => sum + p.amount, 0);
  const totalAdvanceDeducted = payments
    .filter((p) => p.type === "advance_deduction")
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPartial = payments
    .filter((p) => p.type === "partial")
    .reduce((sum, p) => sum + p.amount, 0);
  const totalSalary = payments
    .filter((p) => p.type === "salary")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: open ? 0 : "100%" }}
      transition={{ duration: 0.25 }}
      className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-gray-900 text-white shadow-lg border-l border-gray-700 z-50 flex flex-col ${
        open ? "block" : "hidden"
      }`}
    >
      <div className="flex justify-between items-center p-4 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold uppercase">{staff.name}</h2>
          <p className="text-xs text-gray-400">Payment History</p>
        </div>
        <button
          className="text-gray-400 hover:text-white transition-colors text-xl"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 p-4 bg-gray-800 border-b border-gray-700">
        <div className="text-center p-2 rounded-sm border border-gray-600">
          <div className="text-lg font-bold text-amber-400">{formatCurrency(totalAdvance)}</div>
          <div className="text-xs text-gray-400 uppercase">Total Advance</div>
        </div>
        <div className="text-center p-2 rounded-sm border border-gray-600">
          <div className="text-lg font-bold text-purple-400">{formatCurrency(totalAdvanceDeducted)}</div>
          <div className="text-xs text-gray-400 uppercase">Deducted</div>
        </div>
        <div className="text-center p-2 rounded-sm border border-gray-600">
          <div className="text-lg font-bold text-blue-400">{formatCurrency(totalPartial)}</div>
          <div className="text-xs text-gray-400 uppercase">Partial Payments</div>
        </div>
        <div className="text-center p-2 rounded-sm border border-gray-600">
          <div className="text-lg font-bold text-green-400">{formatCurrency(totalSalary)}</div>
          <div className="text-xs text-gray-400 uppercase">Salary Payments</div>
        </div>
      </div>

      {/* Pending Advance Notice */}
      {staff.pendingAdvance && staff.pendingAdvance > 0 && (
        <div className="mx-4 mt-4 p-3 bg-amber-900/30 border border-amber-600 rounded-sm">
          <div className="text-sm text-amber-400 font-semibold">
            ⚠ Pending Advance: {formatCurrency(staff.pendingAdvance)}
          </div>
          <p className="text-xs text-amber-200/70 mt-1">
            This amount will be deducted from the next salary settlement.
          </p>
        </div>
      )}

      {/* Payment List */}
      <div className="flex-1 overflow-y-auto p-4">
        {payments.length === 0 && (
          <p className="text-gray-500 text-center mt-10">No payments recorded yet.</p>
        )}

        {payments
          .slice()
          .reverse()
          .map((p, idx) => (
            <div
              key={p._id || idx}
              className={`border rounded-sm p-3 mb-2 ${getPaymentTypeStyle(p.type)}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-sm uppercase">
                    {getPaymentTypeLabel(p.type)}
                  </span>
                  {p.cycleMonth && p.cycleMonth > 1 && (
                    <span className="ml-2 text-xs bg-black/20 px-1.5 py-0.5 rounded">
                      {p.cycleMonth}M Cycle
                    </span>
                  )}
                </div>
                <span className="text-xs opacity-75">
                  {new Date(p.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="font-bold text-lg mt-1">{formatCurrency(p.amount)}</p>
              {p.effectiveSalary && (
                <p className="text-xs opacity-70">
                  Effective Salary: {formatCurrency(p.effectiveSalary)}
                </p>
              )}
              {p.note && (
                <p className="text-sm mt-1 opacity-80 italic border-t border-black/10 pt-1">
                  {p.note}
                </p>
              )}
            </div>
          ))}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 p-4 bg-gray-800">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm uppercase">Total Paid To Date</span>
          <span className="font-bold text-xl text-green-400">
            {formatCurrency(staff.totalPaidToDate || 0)}
          </span>
        </div>
        {staff.salaryMultiplier && staff.salaryMultiplier > 1 && (
          <div className="flex justify-between items-center mt-2 text-sm">
            <span className="text-gray-400">Effective Salary ({staff.salaryMultiplier}×)</span>
            <span className="text-red-400 font-semibold">
              {formatCurrency(staff.effectiveSalary || 0)}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
