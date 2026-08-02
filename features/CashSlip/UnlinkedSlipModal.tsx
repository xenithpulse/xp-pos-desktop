// components/UnlinkedSlipsModal.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Hash, Users, Calendar, AlertTriangle } from "lucide-react";

export interface SlipSummary {
  _id: string;
  copyNumber: string;        // required now
  uniqueNumber: string;      // required now
  amount: number;            // required now
  description?: string;
  createdAt?: string | Date;
  createdBy?: string | null;
  missingFields: string[];
}


type Props = {
  open: boolean;
  onClose: () => void;
  slips: SlipSummary[]; // slim slip shape
  onPostClick: (slip: SlipSummary) => void;
};

export default function UnlinkedSlipsModal({ open, onClose, slips, onPostClick }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-60 flex items-start justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-modal="true"
          role="dialog"
        >
          {/* backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* panel */}
          <motion.section
            className="relative z-10 w-full max-w-5xl bg-white text-black rounded-lg shadow-2xl border border-black/10 overflow-hidden"
            initial={{ y: -12, opacity: 0, scale: 0.995 }}
            animate={{ y: 0, opacity: 1, scale: 1, transition: { duration: 0.18, ease: "easeOut" } }}
            exit={{ y: -8, opacity: 0, transition: { duration: 0.12 } }}
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-black/10">
              <div className="flex items-center gap-3">
                <FileText size={18} />
                <h3 className="text-base font-semibold">Unlinked Cash Slips ({slips.length})</h3>
                <div className="text-sm text-slate-500">Compact view</div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="max-h-[65vh] overflow-auto">
              {/* table-like list in space-conscious rows */}
              <ul className="divide-y divide-black/5">
                {slips.map((s) => (
                  <li key={s._id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 shrink-0 flex items-center justify-center rounded bg-slate-50 border border-black/5">
                      <Hash size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-sm font-medium truncate">{s.copyNumber} • {s.uniqueNumber}</div>
                          <div className="text-sm text-slate-600 truncate">{s.description}</div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-sm font-semibold">PKR {Number(s.amount ?? 0).toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                        <div className="inline-flex items-center gap-1">
                          <Users size={14} />
                          <span>{s.createdBy}</span>
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <Calendar size={14} />
                          <span>{s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}</span>
                        </div>

                        <div className="inline-flex items-center gap-2">
                          <AlertTriangle size={14} className="text-amber-600" />
                          <div className="text-amber-700">{s.missingFields.join(", ")}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => onPostClick(s)}
                        className="px-3 py-1 rounded bg-indigo-600 text-white text-xs"
                      >
                        Post
                      </button>
                    </div>
                  </li>
                ))}
                {slips.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">No unlinked slips — nice work.</li>
                )}
              </ul>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
