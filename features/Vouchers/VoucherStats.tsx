"use client";

import React, { useEffect, useRef, useState } from "react";
import { animate, motion, cubicBezier } from "framer-motion";

// Configuration for easy updates
const DAY_LIMIT = 3;
const TOTAL_VOUCHER_AMOUNT_API = `/api/vouchers/total-amount?days=${DAY_LIMIT}`;
const TOTAL_DAILY_SHEET_EXPENSE_API = `/api/daily-sheet/total-expense?days=${DAY_LIMIT}`;

const formatCurrency = (amount: number): string =>
  amount.toLocaleString("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const CUSTOM_EASING = cubicBezier(0.17, 0.67, 0.83, 0.67);

export default function VoucherStats() {
  const [voucherRaw, setVoucherRaw] = useState<number | null>(null);
  const [sheetRaw, setSheetRaw] = useState<number | null>(null);

  const [voucherDisplay, setVoucherDisplay] = useState("Loading...");
  const [sheetDisplay, setSheetDisplay] = useState("Loading...");
  const [diffDisplay, setDiffDisplay] = useState("");

  const [isFetching, setIsFetching] = useState(true);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const animationControlsRef = useRef<Array<{ stop: () => void }>>([]);

  useEffect(() => {
    let mounted = true;
    setIsFetching(true);
    setIsAnimationComplete(false);

    (async () => {
      try {
        const [vRes, sRes] = await Promise.all([
          fetch(TOTAL_VOUCHER_AMOUNT_API),
          fetch(TOTAL_DAILY_SHEET_EXPENSE_API),
        ]);

        const vJson = await vRes.json();
        const sJson = await sRes.json();

        const vTotal = typeof vJson.totalAmount === "number" ? vJson.totalAmount : Number(vJson.totalAmount ?? 0);
        const sTotal = typeof sJson.totalExpenseAmount === "number" ? sJson.totalExpenseAmount : Number(sJson.totalExpenseAmount ?? 0);

        if (!mounted) return;

        setVoucherRaw(vTotal);
        setSheetRaw(sTotal);
      } catch (err) {
        console.error("Error fetching validation data:", err);
        if (!mounted) return;
        setVoucherRaw(0);
        setSheetRaw(0);
      } finally {
        if (mounted) setIsFetching(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    animationControlsRef.current.forEach((c) => c.stop());
    animationControlsRef.current = [];
    setIsAnimationComplete(false);

    const numericValuesArrived = voucherRaw !== null && sheetRaw !== null;
    if (!numericValuesArrived) return;

    const animationDuration = 1.5;
    let animationsCompletedCount = 0;
    const totalAnimations = 3;

    const checkAllComplete = () => {
      animationsCompletedCount += 1;
      if (animationsCompletedCount === totalAnimations) {
        setIsAnimationComplete(true);
      }
    };

    const startAnim = (from: number, to: number, onUpdate: (s: string) => void, onComplete: () => void, duration = animationDuration) => {
      const controller = animate(from, to, {
        duration,
        ease: CUSTOM_EASING,
        onUpdate: (v) => {
          onUpdate(formatCurrency(v));
        },
        onComplete: onComplete,
      });
      animationControlsRef.current.push(controller);
    };

    startAnim(0, voucherRaw!, setVoucherDisplay, checkAllComplete, animationDuration);
    startAnim(0, sheetRaw!, setSheetDisplay, checkAllComplete, animationDuration);

    const diff = voucherRaw! - sheetRaw!;
    startAnim(0, Math.abs(diff), (s) => {
      const numeric = Number(s.replace(/[^\d.-]/g, ""));
      const prefix = diff < 0 ? "- " : "";
      setDiffDisplay(prefix + formatCurrency(numeric));
    }, checkAllComplete, animationDuration * 0.8);

    return () => {
      animationControlsRef.current.forEach((c) => c.stop());
      animationControlsRef.current = [];
    };
  }, [voucherRaw, sheetRaw]);

  const isLoadingValidation = voucherRaw === null || sheetRaw === null;
  const isMismatch = !isLoadingValidation && Math.abs((voucherRaw ?? 0) - (sheetRaw ?? 0)) > 0.01;

  const validationColor = isLoadingValidation
    ? "bg-gray-50 border-gray-300"
    : isAnimationComplete && isMismatch
    ? "bg-red-50 border-red-300"
    : isAnimationComplete
    ? "bg-green-50 border-green-300"
    : "bg-gray-50 border-gray-300";

  const validationLabel = isLoadingValidation
    ? "Loading..."
    : isAnimationComplete
    ? isMismatch
      ? "MISMATCH 🚨"
      : "MATCH ✅"
    : "Validating...";

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-4 gap-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className={`p-4 rounded-md border-2 shadow-sm col-span-full md:col-span-2 transition-colors duration-500 ${validationColor}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase">
              Global Expense Validation (Last {DAY_LIMIT} Days)
            </p>
            <h3 className="mt-2 text-2xl font-bold text-gray-900">{validationLabel}</h3>
            <p className="mt-2 text-sm text-gray-700">
              Vouchers:{" "}
              <span className="font-medium text-gray-900">
                {voucherDisplay}
              </span>
              {" | "}
              Daily Sheets:{" "}
              <span className="font-medium text-gray-900">
                {sheetDisplay}
              </span>
            </p>
            {isAnimationComplete && (
              <p className="mt-2 text-sm font-medium text-gray-800">
                {isMismatch ? `Difference: ${diffDisplay}` : "Totals match for this period."}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end">
            {isFetching ? (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                <span className="text-xs text-gray-600">Syncing...</span>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-xs text-gray-500">Filtered for</p>
                <p className="text-xs font-bold text-blue-600">Past {DAY_LIMIT} Days</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-md border shadow-sm bg-white">
        <p className="text-xs font-semibold text-gray-600 uppercase">Vouchers ({DAY_LIMIT}d)</p>
        <p className="mt-2 text-xl font-bold text-gray-900">
          {voucherDisplay}
        </p>
        <p className="text-xs text-gray-500 mt-1">Sum for selected period</p>
      </div>

      <div className="p-3 rounded-md border shadow-sm bg-white">
        <p className="text-xs font-semibold text-gray-600 uppercase">Expenses ({DAY_LIMIT}d)</p>
        <p className="mt-2 text-xl font-bold text-gray-900">
          {sheetDisplay}
        </p>
        <p className="text-xs text-gray-500 mt-1">Sum for selected period</p>
      </div>
    </motion.div>
  );
}