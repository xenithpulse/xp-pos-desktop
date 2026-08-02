'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Link2, Users, Eye } from 'lucide-react';
import { useDailySheet } from '../DailySheetContext';
import type { ISlipBookingLink } from './utils';

export interface ISlipEntry {
  _id?: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description?: string;
  paymentMethod?: 'cash' | 'cheque' | 'online';
  bookings?: ISlipBookingLink[];
}

const PAYMENT_BADGE: Record<string, string> = {
  cash:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  cheque: 'bg-amber-50 text-amber-700 border-amber-200',
  online: 'bg-sky-50 text-sky-700 border-sky-200',
};

function PaymentMethodBadge({ method }: { method?: string }) {
  const m = (method ?? 'cash').toLowerCase();
  const cls = PAYMENT_BADGE[m] ?? PAYMENT_BADGE.cash;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {m}
    </span>
  );
}

function BookingChips({ bookings }: { bookings?: ISlipBookingLink[] }) {
  if (!bookings?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {bookings.map((b, i) => {
        const label = b.bookingUniqueId || b.clientName || 'Booking';
        return (
          <span
            key={`${b.bookingId ?? i}-${i}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-medium"
          >
            <Link2 size={10} />
            {label}
            {typeof b.guest === 'number' && b.guest > 0 && (
              <span className="inline-flex items-center gap-0.5 ml-1 text-indigo-500">
                <Users size={10} />
                {b.guest}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SlipDetailsOverlay({
  slip,
  anchorRef,
}: {
  slip: ISlipEntry;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const bookings = slip.bookings ?? [];
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Position overlay relative to the anchor (trigger button) using viewport
  // coords so it escapes any clipping ancestor (`overflow:hidden`, transforms,
  // stacking contexts, etc.). Recompute on scroll/resize while open.
  useLayoutEffect(() => {
    function compute() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 288; // w-72
      const margin = 8;
      let left = r.right - width;
      if (left < margin) left = margin;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      setPos({ top: r.bottom + 4, left });
    }
    compute();
    window.addEventListener('scroll', compute, true);
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute, true);
      window.removeEventListener('resize', compute);
    };
  }, [anchorRef]);

  if (typeof document === 'undefined' || !pos) return null;

  return createPortal(
    <div
      ref={overlayRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 288, zIndex: 9999 }}
      className="p-3 rounded-lg border border-gray-200 bg-white shadow-xl text-xs text-gray-700"
      role="tooltip"
    >
      <div className="font-semibold text-gray-900 mb-1">
        Slip #{slip.uniqueNumber} — Copy #{slip.copyNumber}
      </div>
      <div className="text-gray-600 mb-2">
        Amount: <span className="font-semibold text-gray-900">{Number(slip.amount || 0).toLocaleString()}</span>
      </div>
      {slip.description ? (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Description</div>
          <div className="whitespace-pre-wrap break-words">{slip.description}</div>
        </div>
      ) : null}
      {bookings.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
            Linked Booking{bookings.length > 1 ? 's' : ''}
          </div>
          <ul className="space-y-1.5">
            {bookings.map((b, i) => (
              <li
                key={`${b.bookingId ?? i}-${i}`}
                className="p-1.5 rounded border border-gray-100 bg-gray-50"
              >
                <div className="font-medium text-gray-900">
                  {b.clientName || b.bookingUniqueId || 'Booking'}
                </div>
                {b.bookingUniqueId && (
                  <div className="text-gray-500">ID: {b.bookingUniqueId}</div>
                )}
                {b.eventTimeAndDate && (
                  <div className="text-gray-500">{b.eventTimeAndDate}</div>
                )}
                {b.hallArea && <div className="text-gray-500">Hall: {b.hallArea}</div>}
                {typeof b.guest === 'number' && b.guest > 0 && (
                  <div className="text-gray-500">{b.guest} guests</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!slip.description && bookings.length === 0 && (
        <div className="text-gray-400 italic">No additional details.</div>
      )}
    </div>,
    document.body
  );
}

interface SlipRowProps {
  slip: ISlipEntry;
  keyId: string | undefined;
  loading: boolean;
  hasExtra: boolean;
  detailsOpen: boolean;
  onOpenDetails: (open: boolean) => void;
  onToggleDetails: () => void;
  onRevert: () => void;
}

function SlipRow({
  slip,
  loading,
  hasExtra,
  detailsOpen,
  onOpenDetails,
  onToggleDetails,
  onRevert,
}: SlipRowProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bookings = slip.bookings ?? [];
  return (
    <li className="relative flex items-center gap-3 p-2 rounded-md border border-gray-200 bg-white">
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-700">
          Copy <span className="font-medium">#{slip.copyNumber}</span>
        </span>
        <span className="text-gray-700">
          Unique <span className="font-medium">#{slip.uniqueNumber}</span>
        </span>
        <PaymentMethodBadge method={slip.paymentMethod} />
        <BookingChips bookings={bookings} />
        <span className="ml-auto font-bold text-gray-900">
          {Number(slip.amount || 0).toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onMouseEnter={() => hasExtra && onOpenDetails(true)}
          onMouseLeave={() => onOpenDetails(false)}
          onFocus={() => hasExtra && onOpenDetails(true)}
          onBlur={() => onOpenDetails(false)}
          onClick={() => hasExtra && onToggleDetails()}
          disabled={!hasExtra}
          className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          title={hasExtra ? 'View details' : 'No additional details'}
          aria-label="View slip details"
          aria-expanded={detailsOpen}
        >
          <Eye size={16} />
        </button>
        <button
          type="button"
          onClick={onRevert}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 h-7 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 text-xs font-semibold"
          title="Revert Slip"
        >
          <RotateCcw size={14} />
          UnUse
        </button>
      </div>
      {detailsOpen && hasExtra && (
        <SlipDetailsOverlay slip={slip} anchorRef={triggerRef} />
      )}
    </li>
  );
}

export default function SlipEntriesSection() {
  const { slipEntries, setSlipEntries, refreshSheet, notifySlipMutation } = useDailySheet();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);
  const revertingRef = useRef(false);

  const handleRevert = async (item: ISlipEntry) => {
    // Use uniqueNumber as the primary identifier — the sub-document _id in DailySheet
    // differs from the CashSlip _id, but uniqueNumber is shared between both collections.
    const idForApi = (item.uniqueNumber || item._id)?.toString();
    const matchKey = item.uniqueNumber || item._id;
    if (!idForApi || revertingRef.current) return;
    if (!confirm(`Revert slip ${item.uniqueNumber ?? item._id}?`)) return;

    revertingRef.current = true;
    setLoadingId(idForApi);

    // Optimistic: remove from UI immediately
    const previous = [...slipEntries];
    setSlipEntries(slipEntries.filter((s) => (s.uniqueNumber || s._id) !== matchKey));

    try {
      // Single transactional call — clears used/usedBy/usedAt + removes from daily sheet
      const res = await fetch(`/api/cash-slips/isUsed/${encodeURIComponent(idForApi)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ used: false }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Revert failed (${res.status})`);
      }

      // Server confirmed — refresh for authoritative state
      await refreshSheet();
      notifySlipMutation();
    } catch (err) {
      console.error('Revert failed:', err);
      // Rollback optimistic removal
      setSlipEntries(previous);
      alert('Error reverting slip — action has been rolled back.');
    } finally {
      setLoadingId(null);
      revertingRef.current = false;
    }
  };

  return (
    <div>
      <h4 className="font-semibold mb-2 italic ml-1">Cash Slips Being Used : </h4>
      {slipEntries.length ? (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {slipEntries.map((s) => {
            const keyId = s._id ?? s.uniqueNumber;
            const loading = Boolean(loadingId && loadingId === keyId);
            const bookings = s.bookings ?? [];
            const detailsOpen = openDetailsId === keyId;
            const hasExtra = Boolean(s.description) || bookings.length > 0;
            return (
              <SlipRow
                key={keyId}
                slip={s}
                keyId={keyId}
                loading={loading}
                hasExtra={hasExtra}
                detailsOpen={detailsOpen}
                onOpenDetails={(open) =>
                  setOpenDetailsId(open ? keyId ?? null : null)
                }
                onToggleDetails={() =>
                  setOpenDetailsId((cur) => (cur === keyId ? null : keyId ?? null))
                }
                onRevert={() => handleRevert(s)}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 ml-2 italic">No slips added yet.</p>
      )}
    </div>
  );
}
