'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaTimes, FaTrash, FaPrint } from 'react-icons/fa';
import { useReactToPrint } from 'react-to-print';
import type { DailySheet } from './types';
import PrintableDailySheet from './PrintableDailySheet';

interface DetailsModalProps {
  sheet: DailySheet;
  openingBalance: number;
  onClose: () => void;
  /** True when this sheet is the most recent AND user is super_admin */
  isLatest?: boolean;
  /** Callback to trigger the delete confirmation flow */
  onDelete?: () => void;
}

export default function DetailsModal({ sheet, openingBalance, onClose, isLatest, onDelete }: DetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DailySheet-${sheet.sheetNumber ?? 'NA'}-${new Date(sheet.date).toISOString().slice(0, 10)}`,
  });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const closingBalance = sheet?.closingBalance || 
    (openingBalance + sheet?.totalIncome - sheet?.totalExpense);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
    >
      <motion.div 
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 border border-black/10 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-black/10 bg-gray-50">
          <div className="text-sm font-semibold text-black">
            {new Date(sheet.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePrint?.()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
              title="Print this daily sheet"
            >
              <FaPrint size={10} />
              Print Sheet
            </button>
            {isLatest && onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:border-red-300 transition-colors"
                title="Delete this daily sheet and undo all its effects"
              >
                <FaTrash size={10} />
                Delete Sheet
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-lg hover:bg-black/5 text-black/50 hover:text-black transition-colors"
            >
              <FaTimes size={14} />
            </button>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-black/10 text-center">
          <div className="p-2">
            <div className="text-[10px] text-black/40 uppercase tracking-wide">Open</div>
            <div className="text-sm font-semibold text-black mt-0.5">{openingBalance?.toLocaleString()}</div>
          </div>
          <div className="p-2">
            <div className="text-[10px] text-green-600 uppercase tracking-wide">Income</div>
            <div className="text-sm font-semibold text-green-600 mt-0.5">+{sheet?.totalIncome?.toLocaleString()}</div>
          </div>
          <div className="p-2">
            <div className="text-[10px] text-red-600 uppercase tracking-wide">Expense</div>
            <div className="text-sm font-semibold text-red-600 mt-0.5">-{sheet?.totalExpense?.toLocaleString()}</div>
          </div>
          <div className="p-2 bg-black/5 rounded-lg">
            <div className="text-[10px] text-black/50 uppercase tracking-wide">Close</div>
            <div className="text-sm font-bold text-black mt-0.5">{closingBalance?.toLocaleString()}</div>
          </div>
        </div>

        {/* Notes */}
        {sheet.notes && (
          <div className="px-4 py-3 border-b border-black/10 bg-gray-50">
            <p className="text-xs text-black/60 italic">{sheet.notes}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-4 space-y-4">
          {/* Slip Entries */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-green-500 rounded-full" />
              <span className="text-xs font-semibold text-black/70">Slips ({sheet.slipEntries.length})</span>
            </div>
            {sheet.slipEntries.length > 0 ? (
              <div className="space-y-1 max-h-[30vh] overflow-y-scroll">
                {sheet.slipEntries.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-xs hover:bg-black/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-black">{entry.amount?.toLocaleString()}</span>
                      {entry.description && <span className="text-black/40">{entry.description}</span>}
                    </div>
                    <div className="text-black/50">
                      {entry.copyNumber} <span className="text-black/30">({entry.uniqueNumber})</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-black/30 text-center py-3">No slips</p>
            )}
          </div>

          {/* Detailed Entries */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-black rounded-full" />
              <span className="text-xs font-semibold text-black/70">Entries ({sheet.entries.length})</span>
            </div>
            {sheet.entries.length > 0 ? (
              <div className="space-y-1 max-h-[30vh] overflow-y-scroll">
                {sheet.entries.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-xs hover:bg-black/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-black capitalize">
                        {entry.category.replace(/_/g, ' ')}
                      </span>
                      {entry.description && <span className="text-black/40">{entry.description}</span>}
                    </div>
                    <span className="font-semibold text-black tabular-nums">
                      {entry.amount?.toLocaleString()}
                      <span className="text-black/30 italic"> {entry.postedCopyNumber} | {entry.postedUniqueNumber} </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-black/30 text-center py-3">No entries</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Off-screen printable mount — react-to-print clones this DOM into the print window. */}
      <PrintableDailySheet ref={printRef} sheet={sheet} />
    </motion.div>
  );
}
