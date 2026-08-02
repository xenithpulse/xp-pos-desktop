import React, { useMemo, useState, useCallback } from "react";
import { ICashSlip } from "@/models/schemas/cashslip.schema";
import ContractInfoPopover from "./ContractInfoPop";
import InfoMagnifier from "./InfoMagnifier";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Edit3, Printer, Trash2, Link, Unlink, MoreVertical, Check, X, Loader2 } from "lucide-react";

// --- Types -----------------------------------------------------------------
type SummaryPayload = {
  copyNumber: string;
  totalAmount: number;
  count: number;
  usedCount: number;
  unusedCount: number;
  ceoSignedCount: number;
  paymentMethodBreakdown: Record<string, number>;
  earliestDate: Date;
  latestDate: Date;
};

type Helpers = {
  editingId: string | null;
  editAmount: string;
  editDescription: string;
  editPaymentMethod: string | null;
  startEditing: (s: ICashSlip) => void;
  cancelEditing: () => void;
  saveEdit: (slipId: string) => Promise<void>;
  setEditAmount: (v: string) => void;
  setEditDescription: (v: string) => void;
  handleSelectPaymentMethod: (m: string) => void;
  saving: boolean;
  onSignedByCEOChange: (slipId: string, checked: boolean) => Promise<void> | void;
  onDelete: (slipId: string) => Promise<void> | void;
  onPrint: (slip: ICashSlip) => void;
  onOpenContractModal: (slip: ICashSlip) => void;
  onUnpost: (slipId: string, bookingId?: string) => Promise<void>;
  unposting: string | null;
  methods: string[];
};

interface CashSlipSummaryRowsProps {
  slips: ICashSlip[];
  limit: number;
  methods?: string[];
  sortOrder?: "asc" | "desc";
  summaryOnTop?: boolean;
  onSaveEdit?: (slipId: string, payload: { amount: number; description: string; paymentMethod?: string }) => Promise<void> | void;
  onDelete?: (slipId: string) => Promise<void> | void;
  onPrint?: (slip: ICashSlip) => void;
  onOpenContractModal?: (slip: ICashSlip) => void;
  onSignedByCEOChange?: (slipId: string, checked: boolean) => Promise<void> | void;
  onUnpostSuccess?: () => void;
  renderSummaryRow?: (summary: SummaryPayload) => React.ReactNode;
  renderRow?: (slip: ICashSlip, helpers: Helpers) => React.ReactNode;
}

function formatExactNumber(value: number | string): string {
  // Convert the input to a number, handling strings and invalid values
  let numValue: number;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return value; // Return the original string if it's not a valid number
    }
  } else if (typeof value === 'number') {
    numValue = value;
  } else {
    return String(value); // For other types, convert to string
  }

  // Handle numbers with thousands or millions
  const absValue = Math.abs(numValue);

  // Case 1: Millions (e.g., 4000000)
  if (absValue >= 1_000_000 && numValue % 1_000_000 === 0) {
    return `${numValue / 1_000_000}M`;
  }

  // Case 2: Thousands (e.g., 4378000)
  if (absValue >= 1_000 && numValue % 1_000 === 0) {
    const thousandsPart = numValue / 1_000;
    return `${thousandsPart.toLocaleString()}k`;
  }
  
  // Case 3: All other large numbers (e.g., 4378929, 98765.43)
  if (absValue >= 1_000) {
    return numValue.toLocaleString();
  }

  // Case 4: Small numbers (less than 1000)
  return numValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
  
// --- Default renderers ----------------------------------------------------
const defaultRenderSummaryRow = (p: SummaryPayload) => (
  <tr
    key={`summary-${p.copyNumber}`}
    className="bg-yellow-100 font-semibold border-y-2 border-yellow-400 sticky top-0 z-10 text-sm md:text-sm"
  >
    <td className="p-3" colSpan={2}>
      <div className="flex flex-col">
        <span>Summary for Copy #{p?.copyNumber}</span>
        <span className="text-xs text-gray-600 font-normal mt-1">
          {p.earliestDate.toLocaleDateString()} &rarr; {p.latestDate.toLocaleDateString()}
        </span>
      </div>
    </td>
    <td className="p-3 text-right font-bold text-gray-800">{formatExactNumber(p.totalAmount.toFixed(2))}</td>
    <td className="p-3 text-center">{p.count} slips</td>
    <td className="p-3 text-center">{p.usedCount} used</td>
    <td className="p-3 text-center">{p.unusedCount} unused</td>
    <td className="p-1 text-center">{p.ceoSignedCount} CEO signed</td>
    <td className="p-3" colSpan={4}>
      <div className="flex flex-wrap gap-2 justify-start items-center">
        {Object.entries(p.paymentMethodBreakdown).map(([method, num]) => (
          <span
            key={method}
            className="bg-yellow-300 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full whitespace-nowrap"
          >
            {method}: {num}
          </span>
        ))}
      </div>
    </td>
  </tr>
);

// --- Component -------------------------------------------------------------
export default function CashSlipSummaryRows({
  slips,
  methods = ["Cash", "Cheque", "Online"],
  sortOrder = "desc",
  summaryOnTop = true,
  onSaveEdit = async () => {},
  onDelete = async () => {},
  onPrint = () => {},
  onOpenContractModal = () => {},
  onSignedByCEOChange = async () => {},
  onUnpostSuccess,
  renderSummaryRow,
  renderRow,
}: CashSlipSummaryRowsProps) {
  // Single "which row is in edit mode" + temporary per-row edit buffer
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState<Record<string, { amount: string; description: string; paymentMethod: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [unposting, setUnposting] = useState<string | null>(null);

  // Unpost handler
  const handleUnpost = useCallback(async (slipId: string, bookingId?: string) => {
    if (unposting) return;
    setUnposting(slipId);
    try {
      await axios.put(`/api/cash-slips/unpost/${slipId}`, { bookingId });
      onUnpostSuccess?.();
    } catch (err) {
      console.error("Unpost failed:", err);
      alert("Failed to unpost. Please try again.");
    } finally {
      setUnposting(null);
    }
  }, [unposting, onUnpostSuccess]);

  // Sorted copy of slips
  const slipsCopy = useMemo(() => {
    const arr = Array.isArray(slips) ? [...slips] : [];
    arr.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
    return arr;
  }, [slips]);

  const grouped = useMemo(() => {
    const map = new Map<string, ICashSlip[]>();
    for (const s of slipsCopy) {
      if (!map.has(s.copyNumber)) map.set(s.copyNumber, []);
      map.get(s.copyNumber)!.push(s);
    }
    return map;
  }, [slipsCopy]);

  const startEditing = useCallback((s: ICashSlip) => {
    setEditingId(String(s._id));
    setEditBuffer((prev) => ({
      ...prev,
      [String(s._id)]: {
        amount: String(s.amount ?? ""),
        description: s.description ?? "",
        paymentMethod: s.paymentMethod ?? null,
      },
    }));
  }, []);

  const cancelEditing = useCallback(() => {
    if (editingId) {
      setEditBuffer((prev) => {
        const copy = { ...prev };
        delete copy[editingId];
        return copy;
      });
    }
    setEditingId(null);
  }, [editingId]);

  const saveEdit = useCallback(async (slipId: string) => {
    if (!editingId || editingId !== slipId) return;
    setSaving(true);
    try {
      const buf = editBuffer[slipId];
      const payload = {
        amount: Number(buf?.amount || 0),
        description: buf?.description || "",
        paymentMethod: buf?.paymentMethod ?? undefined,
      };
      await onSaveEdit(slipId, payload);
      // clear buffer for this slip
      setEditBuffer((prev) => {
        const copy = { ...prev };
        delete copy[slipId];
        return copy;
      });
      setEditingId(null);
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setSaving(false);
    }
  }, [editingId, editBuffer, onSaveEdit]);

  const handleSelectPaymentMethod = useCallback((m: string) => {
    if (!editingId) return;
    setEditBuffer((prev) => ({
      ...prev,
      [editingId]: {
        ...(prev[editingId] || { amount: "", description: "", paymentMethod: null }),
        paymentMethod: m,
      },
    }));
  }, [editingId]);

  // helpers used by default renderer fallback
  const makeHelpers = (slip: ICashSlip): Helpers => {
    const buffer = editBuffer[String(slip._id)] || { amount: "", description: "", paymentMethod: null };
    return {
      editingId,
      editAmount: buffer.amount,
      editDescription: buffer.description,
      editPaymentMethod: buffer.paymentMethod,
      startEditing,
      cancelEditing,
      saveEdit,
      setEditAmount: (v: string) => {
        setEditBuffer((prev) => ({
          ...prev,
          [String(slip._id)]: { ...(prev[String(slip._id)] || { amount: "", description: "", paymentMethod: null }), amount: v },
        }));
      },
      setEditDescription: (v: string) => {
        setEditBuffer((prev) => ({
          ...prev,
          [String(slip._id)]: { ...(prev[String(slip._id)] || { amount: "", description: "", paymentMethod: null }), description: v },
        }));
      },
      handleSelectPaymentMethod,
      saving,
      onSignedByCEOChange,
      onDelete,
      onPrint,
      onOpenContractModal,
      onUnpost: handleUnpost,
      unposting,
      methods,
    };
  };

  const finalRows: React.ReactNode[] = [];

  // maintain insertion order of groups based on slipsCopy
  const seen = new Set<string>();
  const orderedGroups: string[] = [];
  for (const s of slipsCopy) {
    if (!seen.has(s.copyNumber)) {
      seen.add(s.copyNumber);
      orderedGroups.push(s.copyNumber);
    }
  }

  for (const copyNumber of orderedGroups) {
    const group = grouped.get(copyNumber) || [];

    const sortedGroup = [...group].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? ta - tb : tb - ta;
    });

    const totalAmount = sortedGroup.reduce((sum, s) => sum + (s.amount || 0), 0);
    const count = sortedGroup.length;
    const usedCount = sortedGroup.filter((s) => !!s.used).length;
    const unusedCount = count - usedCount;
    const ceoSignedCount = sortedGroup.filter((s) => !!s.signedByCEO).length;
    const paymentMethodBreakdown = sortedGroup.reduce<Record<string, number>>((acc, s) => {
      const key = s.paymentMethod || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const times = sortedGroup.map((s) => new Date(s.createdAt).getTime());
    const earliestDate = times.length ? new Date(Math.min(...times)) : new Date();
    const latestDate = times.length ? new Date(Math.max(...times)) : new Date();

    const summaryPayload: SummaryPayload = {
      copyNumber,
      totalAmount,
      count,
      usedCount,
      unusedCount,
      ceoSignedCount,
      paymentMethodBreakdown,
      earliestDate,
      latestDate,
    };

    if (summaryOnTop) {
      finalRows.push(renderSummaryRow ? renderSummaryRow(summaryPayload) : defaultRenderSummaryRow(summaryPayload));
    }

    for (const slip of sortedGroup) {
      const helpers = makeHelpers(slip);

      if (renderRow) {
        finalRows.push(<React.Fragment key={`row-${slip._id}`}>{renderRow(slip, helpers)}</React.Fragment>);
      } else {
        // default row
        finalRows.push(
          <tr
            key={`row-${slip._id}`}
            className={`border-b border-gray-200 transition-colors ${
              slip.used === true ? "bg-red-50 hover:bg-red-100" : "bg-green-50 hover:bg-green-100"
            }`}
          >
            <td className="p-2 text-center text-sm">{slip.copyNumber}</td>
            <td className="p-2 text-center text-sm">{slip.uniqueNumber}</td>
            <td className="p-2 text-sm">
              <InfoMagnifier
                createdAt={slip.createdAt}
                createdBy={slip.createdBy}
                description={slip.description}
                maxLength={20}
              />
            </td>
            <td className="p-2 text-sm">
              {helpers.editingId === String(slip._id) ? (
                <input
                  type="number"
                  value={helpers.editAmount}
                  onChange={(e) => helpers.setEditAmount(e.target.value)}
                  className="border rounded-md px-2 py-1 w-24 text-right"
                />
              ) : (
                <span className="block text-right">{formatExactNumber(slip.amount)}</span>
              )}
            </td>
            <td className="p-2 text-sm max-w-xs truncate">
              {helpers.editingId === String(slip._id) ? (
                <input
                  type="text"
                  value={helpers.editDescription}
                  onChange={(e) => helpers.setEditDescription(e.target.value)}
                  className="border rounded-md px-2 py-1 w-full"
                />
              ) : (
                <span className="text-gray-600 truncate block max-w-37.5" title={slip.description}>
                  {slip.description}
                </span>
              )}
            </td>
            <td className="p-2 text-sm">
              {helpers.editingId === String(slip._id) ? (
                <div className="flex flex-wrap gap-1">
                  {helpers.methods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => helpers.handleSelectPaymentMethod(m)}
                      className={`text-xs font-medium px-2 py-1 rounded-full border transition-colors ${
                        helpers.editPaymentMethod === m
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-800 border-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ) : (
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    slip.paymentMethod === "Cheque"
                      ? "bg-blue-200 text-blue-800"
                      : slip.paymentMethod === "Online"
                      ? "bg-green-200 text-green-800"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {slip.paymentMethod}
                </span>
              )}
            </td>
            <td className="p-2 text-sm">{slip?.usedBy || "-"}</td>
            <td className="p-2 text-sm whitespace-nowrap text-gray-500">
              {slip.usedAt ? new Date(slip.usedAt).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "-"}
            </td>
            <td className="p-2 text-center">{slip.addedToContract?.length ? "✅" : "❌"}</td>
            <td className="p-2 text-center">
              <input
                type="checkbox"
                checked={!!slip.signedByCEO}
                onChange={(e) => onSignedByCEOChange(String(slip._id), e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600 rounded"
              />
            </td>
            <td className="p-2">
              <div className="flex items-center gap-1">
                <AnimatePresence mode="wait">
                  {helpers.editingId === String(slip._id) ? (
                    <motion.div
                      key="edit-actions"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1"
                    >
                      <motion.button
                        onClick={() => helpers.saveEdit(String(slip._id))}
                        disabled={helpers.saving}
                        className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md disabled:opacity-50 transition-colors"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        title="Save"
                      >
                        {helpers.saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </motion.button>
                      <motion.button
                        onClick={helpers.cancelEditing}
                        className="p-1.5 bg-gray-400 hover:bg-gray-500 text-white rounded-md transition-colors"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="row-actions"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1"
                    >
                      {/* Contract Actions */}
                      {slip.addedToContract?.length ? (
                        <div className="flex items-center gap-1">
                          <ContractInfoPopover data={slip.addedToContract} />
                          <motion.button
                            onClick={() => helpers.onUnpost(String(slip._id), slip.addedToContract?.[0]?.bookingId?.toString())}
                            disabled={helpers.unposting === String(slip._id)}
                            className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md disabled:opacity-50 transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            title="Unlink from Contract"
                          >
                            {helpers.unposting === String(slip._id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Unlink className="w-3.5 h-3.5" />
                            )}
                          </motion.button>
                        </div>
                      ) : (
                        <motion.button
                          onClick={() => onOpenContractModal(slip)}
                          className="p-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded-md transition-colors"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          title="Link to Contract"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </motion.button>
                      )}

                      {/* More Actions Dropdown */}
                      <div className="relative group">
                        <motion.button
                          className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
                        </motion.button>
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 min-w-30 py-1 overflow-hidden">
                          <button
                            onClick={() => helpers.startEditing(slip)}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => onPrint(slip)}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => onDelete(String(slip._id))}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </td>
          </tr>
        );
      }
    }

    if (!summaryOnTop) {
      finalRows.push(renderSummaryRow ? renderSummaryRow(summaryPayload) : defaultRenderSummaryRow(summaryPayload));
    }
  }

  return (
    <div className="overflow-x-auto min-h-screen">
      <table className="min-w-full table-auto border-collapse">
        <thead>
          <tr className="bg-gray-200 text-gray-700 uppercase text-sm leading-normal">
            <th className="py-3 px-6 text-center">Copy No.</th>
            <th className="py-3 px-6 text-center">Unique No.</th>
            <th className="py-3 px-6 text-left">Created At</th>
            <th className="py-3 px-6 text-right">Amount</th>
            <th className="py-3 px-6 text-left">Description</th>
            <th className="py-3 px-6 text-center">Payment Method</th>
            <th className="py-3 px-6 text-left">Used By</th>
            <th className="py-3 px-6 text-left">Used At</th>
            <th className="py-3 px-6 text-center">Added to Contract</th>
            <th className="py-3 px-6 text-center">CEO Signed</th>
            <th className="py-3 px-6 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>{finalRows}</tbody>
      </table>
    </div>
  );
}
