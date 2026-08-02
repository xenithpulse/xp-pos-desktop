"use client";

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ICashSlip } from "@/models/schemas/cashslip.schema";

interface CashSlipConfigProps {
  slips: ICashSlip[];
  currentCopyNumber: string;
  currentUsedCount: number;
  limit: number;
  
  // Config form values
  newCopyNumber: string;
  setNewCopyNumber: (val: string) => void;
  newUniquePrefix: string;
  setNewUniquePrefix: (val: string) => void;
  newLimit: string;
  setNewLimit: (val: string) => void;
  
  // Actions
  updateSlipConfig: () => void;
}

export default function CashSlipConfig({
  slips,
  currentCopyNumber,
  currentUsedCount,
  limit,
  newCopyNumber,
  setNewCopyNumber,
  newUniquePrefix,
  setNewUniquePrefix,
  newLimit,
  setNewLimit,
  updateSlipConfig,
}: CashSlipConfigProps) {
  const [configExpanded, setConfigExpanded] = useState(false);
  const remaining = limit - currentUsedCount;

  // Auto-expand when remaining hits 0
  useEffect(() => {
    if (remaining <= 0 && slips.length > 0) {
      setConfigExpanded(true);
    }
  }, [remaining, slips.length]);

  if (!currentCopyNumber && slips.length === 0) {
    return (
      <motion.div
        className="border rounded-md bg-yellow-50 border-yellow-200 p-4"
        layout
      >
        <div className="flex items-center gap-4 text-sm text-gray-700 mb-3">
          <span className="text-gray-500">No config set</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`border rounded-md transition-colors ${
        remaining <= 0 && slips.length > 0
          ? "bg-red-50 border-red-200"
          : "bg-yellow-50 border-yellow-200"
      } ${configExpanded ? "p-4" : "px-4 py-2"}`}
      layout
    >
      {/* Collapsed View - Single Row */}
      {!configExpanded && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-sm">
            {slips.length > 0 ? (
              <>
                <span className={`font-semibold italic ${remaining <= 1 ? "text-red-600" : "text-black/700"}`}>
                  {remaining} remaining
                </span>
              </>
            ) : (
              <span className="text-gray-500">No config set</span>
            )}
          </div>
          
          <button
            type="button"
            onClick={() => setConfigExpanded(true)}
            className={`px-3 py-1 text-sm font-medium rounded transition ${
              remaining <= 0 && slips.length > 0
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-transparent border border-gray-400 text-black italic hover:bg-green-400 hover:text-white"
            }`}
          >
            {remaining <= 0 && slips.length > 0 ? "Create New Config" : "Edit Config"}
          </button>
        </div>
      )}

      {/* Expanded View */}
      <AnimatePresence>
        {configExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-3">
              <h3 className={`font-semibold text-sm ${
                remaining <= 0 && slips.length > 0 ? "text-red-700" : "text-black/700 italic"
              }`}>
                {remaining <= 0 && slips.length > 0
                  ? "⚠️ Limit Reached - Create New Config"
                  : "Cash Slip Config"
                }
              </h3>
              <button
                type="button"
                onClick={() => setConfigExpanded(false)}
                className="text-gray-500 hover:text-gray-700 transition p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Current Status */}
            {slips.length > 0 && (
              <div className="flex items-center gap-4 text-sm text-gray-700 mb-3 pb-3 border-b border-gray-200">
                <span>
                  Copy: <strong>{currentCopyNumber}</strong>
                </span>
                <span>
                  Used: <strong>{currentUsedCount}/{limit}</strong>
                </span>
                <span className={`font-semibold ${remaining <= 3 ? "text-red-600" : "text-green-600"}`}>
                  {remaining} remaining
                </span>
              </div>
            )}

            {/* Config Form */}
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="New Copy Number (e.g. B01)"
                value={newCopyNumber}
                onChange={(e) => setNewCopyNumber(e.target.value)}
                className="border px-3 py-2 rounded w-full md:w-40 text-sm"
              />
              <input
                type="text"
                placeholder="New Unique Prefix (e.g. B4)"
                value={newUniquePrefix}
                onChange={(e) => setNewUniquePrefix(e.target.value)}
                className="border px-3 py-2 rounded w-full md:w-40 text-sm"
              />
              <input
                type="number"
                placeholder="Limit (e.g. 25)"
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                className="border px-3 py-2 rounded w-full md:w-28 text-sm"
              />
              <button
                onClick={updateSlipConfig}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm font-medium"
              >
                Save Config
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
