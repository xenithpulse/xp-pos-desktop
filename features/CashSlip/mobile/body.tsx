"use client";

import React from "react";
import { useCashSlipLogic } from "../utils";
import { ICashSlip } from "@/models/schemas/cashslip.schema";
import { PaymentMethod } from "../CashSlips";

const MobileCashSlipList: React.FC = () => {
  const {
    slips,
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
    error,
    currentCopyNumber,
    limit,
    newCopyNumber,
    setNewCopyNumber,
    newUniquePrefix,
    setNewUniquePrefix,
    newLimit,
    setNewLimit,
    totalPages,
    page,
    setPage,
    perPage,
    total,
    fetchSlips,
    addSlip,
    updateSlipConfig,
    deleteSlip,
    currentUsedCount,
    triggerPrint,
  } = useCashSlipLogic();

  const handlePrev = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNext = () => {
    if (page < totalPages) setPage(page + 1);
  };

  const methods: PaymentMethod[] = ["Cheque", "Online", "Cash"];

  return (
    <div className="p-3 space-y-4 max-w-lg md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      <h2 className="text-xl md:text-2xl font-bold text-center text-gray-800">
       Cash Slips
      </h2>

      <form
        onSubmit={addSlip}
        className="flex flex-wrap items-end gap-3 md:gap-4 bg-blue-50 p-4 rounded-xl shadow-md"
      >
        {/* Description Input */}
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border px-3 py-2 rounded-lg w-full md:w-64 grow" // Allow growth on medium screens
        />

        <div className="flex flex-row gap-3 pt-2 items-center">
        {/* Amount Input */}
        <input
          type="number"
          placeholder="Amount (Rs)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border px-3 py-2 rounded-lg w-full md:w-36 grow" // Use flex-grow for better fitting
        />

        {/* Copy Number Dropdown */}
        <div className="flex flex-col w-1/2 pr-1 md:w-auto">
          <select
            value={selectedCopy}
            onChange={(e) => setSelectedCopy(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
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
        <div className="flex flex-col w-1/2 pl-1 md:w-auto">
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
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
        </div>

        {/* Payment Method - full width on mobile, takes space it needs on medium+ */}
        <div className="w-full md:w-auto">
          <p className="text-sm font-medium text-gray-700 mb-1">
            Payment method
          </p>
          <div className="flex flex-wrap gap-2">
            {methods.map((method: PaymentMethod) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`px-3 py-1 text-sm border transition ${
                  paymentMethod === method
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-white text-gray-700 hover:bg-gray-100 border-gray-300"
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-row gap-3 pt-1 items-center">
        <button
          type="submit"
          disabled={isSubmitting || slotsLoading || configLoading || !amount || !description || !selectedCopy || !selectedSlot}
          className="w-full md:w-auto bg-green-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition font-semibold mt-1"
        >
          {isSubmitting ? "Saving..." : "Add"}
        </button>
          <button
          type="button"
          onClick={() => fetchSlips({ page, limit: perPage })}
          disabled={slipsLoading || isSubmitting}
          className="w-full md:w-auto bg-blue-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition font-semibold mt-1"
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
            "Refresh"
          )}
        </button>
         </div>
      </form>

      {/* ---------------- Error ---------------- */}
      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm font-medium border border-red-300">
          🚨 Error: {error}
        </div>
      )}
      
      {/* ---------------- Config Section ---------------- */}
      <div className="border border-yellow-300 p-4 rounded-xl bg-yellow-50 space-y-3 shadow-sm">
        <h3 className="text-yellow-800 font-bold text-sm flex items-center">
          ⚙️ Cash Slip Config (Edit Anytime)
        </h3>

        <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-700">
          <p>
            Current Copy Number:{" "}
            <strong className="text-gray-900">{currentCopyNumber || "N/A"}</strong>
          </p>
          <p className="col-span-2">
            Used Unique Numbers:{" "}
            <strong className="text-gray-900">
              {currentUsedCount} / {limit || "N/A"}
            </strong>
          </p>
        </div>

        <div className="flex flex-row gap-3 pt-2 items-center">
          <input
            type="text"
            placeholder="New Copy Number (e.g. B01)"
            value={newCopyNumber}
            onChange={(e) => setNewCopyNumber(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full md:w-40 focus:ring-yellow-500 focus:border-yellow-500"
          />
          <input
            type="text"
            placeholder="New Unique Prefix (e.g. B4)"
            value={newUniquePrefix}
            onChange={(e) => setNewUniquePrefix(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full md:w-40 focus:ring-yellow-500 focus:border-yellow-500"
          />
          <input
            type="number"
            placeholder="Limit (e.g. 25)"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full md:w-32 focus:ring-yellow-500 focus:border-yellow-500"
          />
          <button
            onClick={updateSlipConfig}
            className="bg-green-600 text-white px-3 py-2 rounded-lg"
            disabled={!newCopyNumber && !newUniquePrefix && !newLimit}
          >
            Save
          </button>
        </div>
      </div>

      {/* ---------------- List and State ---------------- */}
      
      {/* Loading state */}
      {slipsLoading && (
        <div className="flex justify-center py-10 text-xl text-gray-500 font-semibold">
          ⏳ Loading slips...
        </div>
      )}

      {/* Empty state */}
      {!slipsLoading && slips.length === 0 && (
        <div className="text-center text-gray-500 py-10 text-lg border-2 border-dashed rounded-lg mt-6">
          🧾 No Cash Slips Found. Use the form above to add one!
        </div>
      )}

      {/* Cash Slip Cards Container (Grid on larger screens) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
        {!slipsLoading &&
          slips.map((slip: ICashSlip) => (
            <div
              key={slip.copyNumber}
              className="bg-white shadow-lg hover:shadow-xl transition-shadow rounded-xl p-4 border border-gray-100"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-gray-800">
                  <span className="text-blue-600">#</span>
                  {slip.uniqueNumber}
                </h3>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${
                    slip.paymentMethod === "Cash"
                      ? "bg-green-100 text-green-700"
                      : slip.paymentMethod === "Cheque"
                      ? "bg-yellow-100 text-yellow-700"
                      : slip.paymentMethod === "Online"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {slip.paymentMethod || "N/A"}
                </span>
              </div>

              <div className="mt-2 text-sm text-gray-700 space-y-1">
                <p className="border-b pb-1">
                  <span className="font-semibold text-gray-600">Amount:</span>{" "}
                  <span className="font-bold text-lg text-green-700">
                    Rs. {Number(slip.amount).toLocaleString()}
                  </span>
                </p>
                <p>
                  <span className="font-semibold text-gray-600">Description:</span>{" "}
                  {slip.description || "—"}
                </p>
                <p className="text-xs text-gray-500 pt-1">
                  Created: {new Date(slip.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-4 border-t pt-3">
                <button
                  onClick={() => triggerPrint(slip)}
                  className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => deleteSlip(String(slip._id))}
                  className="text-sm font-bold text-red-600 hover:text-red-800 transition"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
      </div>

      {/* Pagination */}
      {!slipsLoading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 pt-6">
          <button
            onClick={handlePrev}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg text-base font-semibold text-gray-700 bg-white hover:bg-gray-100 transition disabled:opacity-50"
          >
            ⬅️ Previous Page
          </button>
          <span className="text-base font-medium text-gray-700">
            Page **{page}** of **{totalPages}** (Total: **{total.toLocaleString()}**)
          </span>
          <button
            onClick={handleNext}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg text-base font-semibold text-gray-700 bg-white hover:bg-gray-100 transition disabled:opacity-50"
          >
            Next Page ➡️
          </button>
        </div>
      )}
    </div>
  );
};

export default MobileCashSlipList;