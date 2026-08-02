'use client';

/**
 * ContextBarFlip
 *
 * Wraps the sticky Daily Sheet context-bar content and "back-flips" it (a
 * top-hinged rotateX flip) to reveal a log when something notable happens:
 *
 *   • Success  → flips to a green log, then auto-flips back after a short while.
 *   • Error    → flips to a red log that STAYS, showing the exact reason plus a
 *                CTA + Close. e.g. a voucher post failing because the copy book
 *                is full flips the bar to explain it and offers "Open Voucher
 *                Config", which routes to the Vouchers tab and jumps to the
 *                config editor — guiding a forgetful operator to the fix.
 *
 * The notification is read from DailySheetContext, so ANY component under the
 * provider can raise one via `notify(...)` and it surfaces here on every tab.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { useDailySheet, type BarNotification } from './DailySheetContext';

const DEFAULT_SUCCESS_MS = 4200;

interface Props {
  children: React.ReactNode;
  /** Invoked when the user clicks a notification's CTA button. */
  onCta?: (n: BarNotification) => void;
}

export default function ContextBarFlip({ children, onCta }: Props) {
  const { notification, dismissNotification } = useDailySheet();
  const showLog = notification != null;

  // Success logs auto-flip back; errors stay until the user acts.
  useEffect(() => {
    if (!notification || notification.type === 'error') return;
    const ms = notification.autoDismissMs ?? DEFAULT_SUCCESS_MS;
    const id = window.setTimeout(() => dismissNotification(notification.id), ms);
    return () => window.clearTimeout(id);
  }, [notification, dismissNotification]);

  return (
    <div className="relative" style={{ perspective: 1400 }}>
      <AnimatePresence mode="wait" initial={false}>
        {showLog && notification ? (
          <motion.div
            key={`log-${notification.id}`}
            initial={{ rotateX: -88, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ transformOrigin: 'top center', transformStyle: 'preserve-3d' }}
          >
            <NotificationFace
              n={notification}
              onCta={() => {
                onCta?.(notification);
                dismissNotification(notification.id);
              }}
              onClose={() => dismissNotification(notification.id)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="controls"
            initial={{ rotateX: 88, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: -88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            style={{ transformOrigin: 'top center' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationFace({
  n,
  onCta,
  onClose,
}: {
  n: BarNotification;
  onCta: () => void;
  onClose: () => void;
}) {
  const isError = n.type === 'error';
  return (
    <div
      role="status"
      aria-live={isError ? 'assertive' : 'polite'}
      className={[
        'flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2 ring-1',
        isError
          ? 'bg-rose-50 text-rose-800 ring-rose-200'
          : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
      ].join(' ')}
    >
      <span className="mt-0.5 flex-shrink-0">
        {isError ? (
          <AlertTriangle size={16} className="text-rose-600" />
        ) : (
          <CheckCircle2 size={16} className="text-emerald-600" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{n.title}</p>
        {n.message && (
          <p className={`text-xs leading-snug ${isError ? 'text-rose-700' : 'text-emerald-700'}`}>
            {n.message}
          </p>
        )}
      </div>

      <div className="ml-auto flex flex-shrink-0 items-center gap-2">
        {isError && n.cta && (
          <button
            type="button"
            onClick={onCta}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
          >
            {n.cta.label}
            <ArrowRight size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Dismiss"
          className={`inline-flex items-center justify-center rounded-md p-1.5 ${
            isError ? 'text-rose-500 hover:bg-rose-100' : 'text-emerald-600 hover:bg-emerald-100'
          }`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
