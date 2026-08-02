"use client";

import React, { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PaymentMethod } from "./CashSlips";

// Format amount to readable words (Billion, Million, etc.)
function formatAmountToWords(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "";
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  
  if (absNum >= 1_000_000_000_000) {
    return `${sign}${(absNum / 1_000_000_000_000).toFixed(2)} Trillion`;
  } else if (absNum >= 1_000_000_000) {
    return `${sign}${(absNum / 1_000_000_000).toFixed(2)} Billion`;
  } else if (absNum >= 1_000_000) {
    return `${sign}${(absNum / 1_000_000).toFixed(2)} Million`;
  } else if (absNum >= 1_000) {
    return `${sign}${(absNum / 1_000).toFixed(2)} Thousand`;
  }
  return "";
}

interface CashSlipFormProps {
  // Form values
  amount: string;
  setAmount: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (val: PaymentMethod) => void;
  
  // Copy & Slot selection
  copyNumbers: string[];
  selectedCopy: string;
  setSelectedCopy: (val: string) => void;
  availableSlots: string[];
  selectedSlot: string;
  setSelectedSlot: (val: string) => void;
  
  // Loading states
  configLoading: boolean;
  slotsLoading: boolean;
  slipsLoading: boolean;
  isSubmitting: boolean;
  
  // Actions
  fetchSlips: (params: { page: number; limit: number }) => void;
  addSlip: (e: React.FormEvent) => void;
  
  // Pagination context
  page: number;
  perPage: number;
}

const PAYMENT_METHODS: PaymentMethod[] = ["Cheque", "Online", "Cash"];

export default function CashSlipForm({
  amount,
  setAmount,
  description,
  setDescription,
  paymentMethod,
  setPaymentMethod,
  copyNumbers,
  selectedCopy,
  setSelectedCopy,
  availableSlots,
  selectedSlot,
  setSelectedSlot,
  configLoading,
  slotsLoading,
  slipsLoading,
  isSubmitting,
  fetchSlips,
  addSlip,
  page,
  perPage,
}: CashSlipFormProps) {
  const [amountFocused, setAmountFocused] = useState(false);
  
  const formattedAmount = useMemo(() => {
    const num = parseFloat(amount);
    if (isNaN(num)) return "";
    return num.toLocaleString("en-US");
  }, [amount]);
  
  const amountInWords = useMemo(() => formatAmountToWords(amount), [amount]);

  return (
    <form
      onSubmit={addSlip}
      className="flex flex-col md:flex-row gap-4 items-center bg-gray-100 p-4 rounded-lg"
    >
      {/* Refresh Slips */}
      <button
        type="button"
        onClick={() => fetchSlips({ page, limit: perPage })}
        disabled={slipsLoading || isSubmitting}
        className="w-full md:w-auto px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {slipsLoading ? (
          <svg
            className="animate-spin h-5 w-5 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 
              0 0 5.373 0 12h4zm2 5.291A7.962 
              7.962 0 014 12H0c0 3.042 1.135 
              5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : (
          "Refresh Slips"
        )}
      </button>

      {/* Amount Input with Popover */}
      <div className="relative w-full md:w-auto">
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onFocus={() => setAmountFocused(true)}
          onBlur={() => setAmountFocused(false)}
          className="border px-3 py-2 rounded w-full md:w-40"
        />
        
        {/* Amount Popover */}
        <AnimatePresence>
          {amountFocused && amount && parseFloat(amount) > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-50"
            >
              {/* Formatted Number */}
              <div className="text-lg font-bold text-gray-900 tabular-nums tracking-wide">
                {formattedAmount}
              </div>
              
              {/* Amount in Words */}
              {amountInWords && (
                <div className="mt-1 text-sm font-medium text-blue-600">
                  ≈ {amountInWords}
                </div>
              )}
              
              {/* Visual breakdown for large numbers */}
              {parseFloat(amount) >= 1000 && (
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Digits:</span>
                    <span className="font-mono">{amount.length}</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <input
        type="text"
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="border px-3 py-2 rounded flex-1"
      />

      {/* Copy Number Dropdown */}
      <div className="flex flex-col">
        <select
          value={selectedCopy}
          onChange={(e) => setSelectedCopy(e.target.value)}
          className="border px-3 py-2 rounded w-36"
          disabled={configLoading}
        >
          <option value="">
            {configLoading ? "Loading..." : "Select Copy"}
          </option>
          {copyNumbers.map((cn) => (
            <option key={cn} value={cn}>
              {cn}
            </option>
          ))}
        </select>
      </div>

      {/* Unique Number Dropdown */}
      <div className="flex flex-col">
        <select
          value={selectedSlot}
          onChange={(e) => setSelectedSlot(e.target.value)}
          className="border px-3 py-2 rounded w-40"
          disabled={!selectedCopy || slotsLoading}
        >
          <option value="">
            {slotsLoading ? "Loading slots..." : "Select Unique"}
          </option>
          {availableSlots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Method */}
      <div>
        <div className="flex flex-wrap">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`m-1 px-3 py-1 border rounded ${
                paymentMethod === method
                  ? "bg-blue-600 text-white"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {method}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || slotsLoading || configLoading}
        className="bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        {isSubmitting ? "Saving..." : "Add Cash Slip"}
      </button>
    </form>
  );
}
