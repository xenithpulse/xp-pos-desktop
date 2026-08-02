"use client";

import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import CashSlipPrintTemplate from "@/features/CashSlip/CashSlipPrintModal";
import { ICashSlip } from "@/models/schemas/cashslip.schema";
import CashSlipSummaryRows from "./CashSlipSummaryRow";
import { useCashSlipLogic } from "./utils";
import MobileCashSlipList from "./mobile/body";
import CashSlipQuickStats from "./QuickStats";
import CashSlipForm from "./CashSlipForm";
import CashSlipConfig from "./CashSlipConfig";

export type PaymentMethod = "Cheque" | "Online" | "Cash" | "";

export default function CashSlip() {
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
    setPerPage,
    total,
    selectedSlip,
    setSelectedSlip,
    fetchSlips,
    addSlip,
    updateSlipConfig,
    deleteSlip,
    saveEdit,
    handleSignedByCEOChange,
    currentUsedCount,
  } = useCashSlipLogic();

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setSelectedSlip(null),
  });

  const triggerPrint = (slip: ICashSlip) => {
    setSelectedSlip(slip);
    setTimeout(() => handlePrint(), 100);
  };

  const methods: PaymentMethod[] = ["Cheque", "Online", "Cash"];

  return (
    <div className="space-y-6 min-h-screen">
      {/* ✅ MOBILE VIEW */}
      <div className="sm:hidden">
        <MobileCashSlipList />
      </div>

      {/* ✅ DESKTOP / TABLET VIEW */}
      <div className="hidden sm:block">
        {/* ---------------- Add Slip Form ---------------- */}
        <CashSlipForm
          amount={amount}
          setAmount={setAmount}
          description={description}
          setDescription={setDescription}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          copyNumbers={copyNumbers}
          selectedCopy={selectedCopy}
          setSelectedCopy={setSelectedCopy}
          availableSlots={availableSlots}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          configLoading={configLoading}
          slotsLoading={slotsLoading}
          slipsLoading={slipsLoading}
          isSubmitting={isSubmitting}
          fetchSlips={fetchSlips}
          addSlip={addSlip}
          page={page}
          perPage={perPage}
        />

        {/* ---------------- Error ---------------- */}
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded text-sm">
            {error}
          </div>
        )}

        {/* ---------------- Config Section ---------------- */}
        <CashSlipConfig
          slips={slips}
          currentCopyNumber={currentCopyNumber}
          currentUsedCount={currentUsedCount}
          limit={limit}
          newCopyNumber={newCopyNumber}
          setNewCopyNumber={setNewCopyNumber}
          newUniquePrefix={newUniquePrefix}
          setNewUniquePrefix={setNewUniquePrefix}
          newLimit={newLimit}
          setNewLimit={setNewLimit}
          updateSlipConfig={updateSlipConfig}
        />

        {/* ---------------- Table + Pagination ---------------- */}
        {slipsLoading ? (
          <p className="text-center">Loading slips...</p>
        ) : (
          <>
            <CashSlipQuickStats />
            <CashSlipSummaryRows
              slips={slips}
              limit={limit}
              sortOrder="desc"
              summaryOnTop={true}
              methods={methods as string[]}
              onSaveEdit={saveEdit}
              onDelete={deleteSlip}
              onPrint={triggerPrint}
              onOpenContractModal={(s) => setSelectedSlip(s)}
              onSignedByCEOChange={handleSignedByCEOChange}
              onUnpostSuccess={() => fetchSlips({ page, limit: perPage })}
            />

            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 border rounded"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  Prev
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="px-3 py-1 border rounded"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm">Per page:</label>
                <select
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border rounded px-2 py-1"
                >
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                <div className="text-sm">Total: {total}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------------- Hidden print template ---------------- */}
      {selectedSlip && (
        <div style={{ display: "none" }}>
          <CashSlipPrintTemplate ref={printRef} slip={selectedSlip} />
        </div>
      )}
    </div>
  );
}
