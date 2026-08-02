// components/MarkCashSlipsUsedModal.tsx
"use client";
import { useSession } from "next-auth/react";
import React, { use, useEffect, useState } from "react";

type MetaEntry = {
  copyNumber: string;
  minUnique: string | null;
  maxUnique: string | null;
  total: number;
  unused: number;
};

export default function MarkCashSlipsUsedModal({
  isOpen,
  onClose,
  onMutate,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Called after slips are successfully marked used — parent should refresh available slips */
  onMutate?: () => void;
}) {
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [meta, setMeta] = useState<MetaEntry[]>([]);
  const [copyNumber, setCopyNumber] = useState<string>("");
  const [uniqueFrom, setUniqueFrom] = useState("");
  const [uniqueTo, setUniqueTo] = useState("");
  const [allFromCopy, setAllFromCopy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user_session = useSession();
  const usedBy_admin = user_session.data?.user?.name + "-X" || ""; 

  useEffect(() => {
    if (!isOpen) return;
    setLoadingMeta(true);
    fetch("/api/cash-slips/manage-unused")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success) setMeta(data.meta || []);
        else setError("Failed to load copy numbers");
      })
      .catch((e) => {
        console.error(e);
        setError("Failed to load copy numbers");
      })
      .finally(() => setLoadingMeta(false));
  }, [isOpen]);

  const canSubmit =
    confirmText === "mark as used" &&
    !submitting &&
    (allFromCopy ? !!copyNumber : !!copyNumber || (!!uniqueFrom && !!uniqueTo));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultMsg(null);

    if (!canSubmit) {
      setError("Please fill required fields and type 'mark as used' to confirm.");
      return;
    }

    const body = {
      copyNumber: copyNumber || undefined,
      allFromCopy,
      uniqueNumberFrom: uniqueFrom || undefined,
      uniqueNumberTo: uniqueTo || undefined,
      usedBy: usedBy_admin || undefined,
      confirmText,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/cash-slips/manage-unused/mark-used", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data?.message || "Failed to mark slips");
      } else {
        setResultMsg(
          `Marked ${data.modifiedCount ?? 0} slip(s) as used (matched: ${data.matchedCount ?? 0}).`
        );
        // Refresh meta and notify parent to reload available slips
        onMutate?.();
        setTimeout(() => {
          fetch("/api/cash-slips/manage-unused")
            .then((r) => r.json())
            .then((d) => d?.success && setMeta(d.meta || []));
        }, 500);
      }
    } catch (e) {
      console.error(e);
      setError("Server error while marking slips");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div className="relative max-w-2xl w-full bg-white rounded-lg shadow-lg p-6 z-10">
        <h3 className="text-xl font-semibold mb-3">Mark Cash Slips as Used</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Copy Number (book)</label>
            {loadingMeta ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <select
                value={copyNumber}
                onChange={(e) => setCopyNumber(e.target.value)}
                className="mt-1 block w-full border rounded p-2"
              >
                <option value="">-- choose copy number --</option>
                {meta.map((m) => (
                  <option key={m.copyNumber} value={m.copyNumber}>
                    {m.copyNumber} — unused: {m.unused} total: {m.total} (range:{' '}
                    {m.minUnique ?? "-"} → {m.maxUnique ?? "-"})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3">
            <input
              id="allFromCopy"
              type="checkbox"
              checked={allFromCopy}
              onChange={(e) => setAllFromCopy(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="allFromCopy" className="text-sm">
              All slips from selected copy number
            </label>
          </div>

          {!allFromCopy && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium">Unique Number (from)</label>
                <input
                  value={uniqueFrom}
                  onChange={(e) => setUniqueFrom(e.target.value)}
                  className="mt-1 block w-full border rounded p-2"
                  placeholder="e.g. A41"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Unique Number (to)</label>
                <input
                  value={uniqueTo}
                  onChange={(e) => setUniqueTo(e.target.value)}
                  className="mt-1 block w-full border rounded p-2"
                  placeholder="e.g. A60"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium">Type to confirm</label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 block w-full border rounded p-2"
              placeholder='Type: "mark as used"'
            />
            <p className="text-xs text-gray-500 mt-1">
              This is required to prevent accidental bulk marking.
            </p>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {resultMsg && <div className="text-sm text-green-700">{resultMsg}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose()}
              disabled={submitting}
              className="px-4 py-2 rounded border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`px-4 py-2 rounded text-white ${
                canSubmit ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {submitting ? "Marking..." : "Mark as used"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
