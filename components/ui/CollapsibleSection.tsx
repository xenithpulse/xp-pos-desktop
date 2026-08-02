'use client';

/**
 * CollapsibleSection
 * ──────────────────
 * Generic expand/collapse panel with a sticky header. Designed for the
 * Daily Sheet where many secondary actions need to share a small viewport.
 *
 * - `defaultOpen` controls the initial expanded state. Default: false.
 * - `storageKey` (optional) persists the open/closed state to
 *   `localStorage` so the user's preference survives reloads.
 * - `summary` and `badge` render alongside the title even when collapsed,
 *   so the header carries enough signal to decide whether to expand.
 * - `accent` adds a thin coloured left rail (slate / indigo / amber / etc.).
 *
 * Pure CSS animation (no framer-motion dep) so it composes inside any
 * container without measuring layouts.
 */
import React, { useEffect, useRef, useState } from 'react';

type Accent = 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber';

const ACCENTS: Record<Accent, { rail: string; iconBg: string; iconText: string }> = {
  slate: { rail: 'before:bg-slate-300', iconBg: 'bg-slate-100', iconText: 'text-slate-600' },
  indigo: { rail: 'before:bg-indigo-400', iconBg: 'bg-indigo-50', iconText: 'text-indigo-700' },
  emerald: { rail: 'before:bg-emerald-400', iconBg: 'bg-emerald-50', iconText: 'text-emerald-700' },
  rose: { rail: 'before:bg-rose-400', iconBg: 'bg-rose-50', iconText: 'text-rose-700' },
  amber: { rail: 'before:bg-amber-400', iconBg: 'bg-amber-50', iconText: 'text-amber-700' },
};

interface Props {
  title: string;
  subtitle?: string;
  /** Inline summary — rendered next to the title even when collapsed. */
  summary?: React.ReactNode;
  /** Small chip on the right side of the header (e.g. count, status). */
  badge?: React.ReactNode;
  /** Optional leading icon character or node. Kept tiny to fit the header. */
  icon?: React.ReactNode;
  accent?: Accent;
  defaultOpen?: boolean;
  /** When provided, open state is mirrored to localStorage under this key. */
  storageKey?: string;
  /** Right-side actions visible even when collapsed (don't toggle on click). */
  actions?: React.ReactNode;
  /** Set when the section's content state has unsaved or pending work — adds a dot. */
  attentionDot?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  subtitle,
  summary,
  badge,
  icon,
  accent = 'slate',
  defaultOpen = false,
  storageKey,
  actions,
  attentionDot = false,
  className = '',
  children,
}: Props) {
  // Hydration-safe: read storage in an effect, not during render.
  const [open, setOpen] = useState(defaultOpen);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(`cs:${storageKey}`);
      if (raw === '1') setOpen(true);
      else if (raw === '0') setOpen(false);
    } catch {
      /* SSR / disabled storage — keep defaultOpen */
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try {
      window.localStorage.setItem(`cs:${storageKey}`, open ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }, [open, storageKey]);

  const a = ACCENTS[accent];

  return (
    <section
      className={
        'relative rounded-xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden ' +
        `before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${a.rail} ` +
        className
      }
    >
      <header
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="flex items-center gap-3 pl-4 pr-3 py-2.5 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
      >
        {icon && (
          <span
            className={`grid place-items-center w-7 h-7 rounded-md ${a.iconBg} ${a.iconText} text-sm shrink-0`}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 truncate">{title}</h3>
            {attentionDot && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"
                aria-label="Needs attention"
              />
            )}
            {badge && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                {badge}
              </span>
            )}
          </div>
          {(subtitle || summary) && (
            <div className="text-[11px] text-slate-500 truncate">
              {summary ?? subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
        <button
          type="button"
          aria-label={open ? 'Collapse section' : 'Expand section'}
          tabIndex={-1}
          className="grid place-items-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path
              d="M2 4l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {/* Content. We use a grid trick (grid-template-rows: 0fr → 1fr) to get
          smooth height animations without measuring. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 p-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
