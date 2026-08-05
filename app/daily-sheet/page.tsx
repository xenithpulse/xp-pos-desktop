"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RequirePermission from "@/components/auth/RequirePermission";
import DailyExpenseInput from "@/features/sheets/daily/DailySheet";
import DailySheetsHistory from "@/features/sheets/daily/DailySheetsHistory";
import {
  FaEdit,
  FaHistory,
  FaMoneyCheckAlt,
  FaTicketAlt,
  FaChartBar,
} from "react-icons/fa";
import CashSlip from "@/features/CashSlip/CashSlips"
import Vouchers from "@/features/Vouchers/Vouchers";
import ActiveMonthSummary from "@/features/sheets/monthly/ActiveMonthSummary";
import { useSession } from "next-auth/react";
import { DailySheetProvider, type BarNotification } from "@/features/sheets/daily/DailySheetContext";
import DailySheetGlobalControls from "@/features/sheets/daily/DailySheetGlobalControls";
import ContextBarFlip from "@/features/sheets/daily/ContextBarFlip";

// ─── Tab definitions ─────────────────────────────────────────────────────────

type TabName = "dailyInput" | "dailyHistory" | "cashSlip" | "vouchers" | "monthlySheets";

interface TabConfig {
  name: TabName;
  /** URL hash slug (without `#`). Stable, kebab-case. */
  hash: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
}


const TAB_CONFIG: TabConfig[] = [
  {
    name: "dailyInput",
    hash: "daily-input",
    label: "Daily Input",
    shortLabel: "Input",
    description: "Record today's income and expenses",
    icon: <FaEdit className="text-base" />,
  },
  {
    name: "dailyHistory",
    hash: "history",
    label: "Sheets History",
    shortLabel: "History",
    description: "Browse past daily sheets",
    icon: <FaHistory className="text-base" />,
  },
  {
    name: "cashSlip",
    hash: "cash-slips",
    label: "Cash Slips",
    shortLabel: "Slips",
    description: "Issue and manage cash slips",
    icon: <FaMoneyCheckAlt className="text-base" />,
  },
  {
    name: "vouchers",
    hash: "vouchers",
    label: "Vouchers",
    shortLabel: "Vouchers",
    description: "Track and reconcile vouchers",
    icon: <FaTicketAlt className="text-base" />,
  },
  {
    name: "monthlySheets",
    hash: "active-month",
    label: "Active Month",
    shortLabel: "Month",
    description: "Snapshot of the open monthly sheet",
    icon: <FaChartBar className="text-base" />,
  },
];

const DEFAULT_TAB: TabName = "dailyInput";

const hashToTab = (hash: string): TabName | null => {
  const clean = hash.replace(/^#/, "").trim().toLowerCase();
  if (!clean) return null;
  return TAB_CONFIG.find((t) => t.hash === clean)?.name ?? null;
};

const tabToHash = (name: TabName): string =>
  TAB_CONFIG.find((t) => t.name === name)?.hash ?? "";

// ─── Animations ──────────────────────────────────────────────────────────────

const contentVariants = {
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
  enter: { opacity: 1, y: 0, transition: { duration: 0.28, delay: 0.05 } },
};

// ─── TabButton ───────────────────────────────────────────────────────────────

interface TabButtonProps {
  tab: TabConfig;
  activeTab: TabName;
  onClick: (tabName: TabName) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, activeTab, onClick }) => {
  const isActive = activeTab === tab.name;

  return (
    <motion.button
      type="button"
      onClick={() => onClick(tab.name)}
      whileTap={{ scale: 0.97 }}
      title={tab.description}
      role="tab"
      aria-selected={isActive}
      className={`relative rounded-lg px-4 py-1.5 text-sm font-semibold tracking-tight transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-black/20 sm:px-5 sm:py-2 ${
        isActive ? "text-white" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {isActive && (
        <motion.span
          layoutId="tab-indicator"
          className="absolute inset-0 rounded-lg bg-gray-900 shadow-sm"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative z-10 whitespace-nowrap">
        <span className="hidden sm:inline">{tab.label}</span>
        <span className="sm:hidden">{tab.shortLabel}</span>
      </span>
    </motion.button>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DailySheetPage() {
  return (
    <RequirePermission permission="view_reports">
      <DailySheetPageInner />
    </RequirePermission>
  );
}

function DailySheetPageInner() {
  const [activeTab, setActiveTab] = useState<TabName>(DEFAULT_TAB);
  const { data: session } = useSession();


  // ── Hash-based navigation ─────────────────────────────────────────────────
  // Initialise from `window.location.hash` and keep state ↔ hash in sync.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyFromHash = () => {
      const fromHash = hashToTab(window.location.hash);
      if (fromHash) setActiveTab(fromHash);
    };

    applyFromHash();
    window.addEventListener("hashchange", applyFromHash);
    return () => window.removeEventListener("hashchange", applyFromHash);
  }, []);


  // Single click handler updates state AND URL hash without triggering scroll.
  const handleTabChange = useCallback((name: TabName) => {
    setActiveTab(name);
    if (typeof window === "undefined") return;
    const nextHash = `#${tabToHash(name)}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }, []);

  // ── Notification CTA → route to a tab and fire an intent ──────────────────
  // Errors raised via the context bar (e.g. "voucher book full") carry a CTA.
  // Clicking it switches to the target tab and signals the destination — both
  // via a live event (if already mounted) and sessionStorage (read on mount,
  // since tab content only mounts when its tab becomes active).
  const handleCta = useCallback(
    (n: BarNotification) => {
      const cta = n.cta;
      if (!cta) return;
      if (cta.intent && typeof window !== "undefined") {
        sessionStorage.setItem("daily_sheet_intent", cta.intent);
      }
      if (cta.targetHash) {
        const target = TAB_CONFIG.find((t) => t.hash === cta.targetHash);
        if (target) handleTabChange(target.name);
      }
      if (cta.intent && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("daily-sheet:intent", { detail: { intent: cta.intent } }),
        );
      }
    },
    [handleTabChange],
  );

  // ── Active tab metadata for header ────────────────────────────────────────
  const activeMeta = useMemo(
    () => TAB_CONFIG.find((t) => t.name === activeTab) ?? TAB_CONFIG[0],
    [activeTab],
  );

  // ── Content renderer ──────────────────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case "dailyInput":
        return <DailyExpenseInput />;
      case "dailyHistory":
        return <DailySheetsHistory />;
      case "cashSlip":
        return <CashSlip />;
      case "vouchers":
        return <Vouchers />;
      case "monthlySheets":
        return <ActiveMonthSummary />;
      default:
        return null;
    }
  };

  return (
    <DailySheetProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-9xl mx-auto space-y-6">
            {/* ── Global Context Bar ─────────────────────────────────────
                Two-row layout:
                  Row 1 — Tabs (left) · active-tab description (right)
                  Row 2 — Sheet/month status · sync · refresh · close
                Controls render on every tab so the user always has a single
                source of truth for sheet state — no more "why is the bar
                empty on the History tab?" surprises. */}
            <motion.div
              className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 border-b border-gray-200 bg-white/90 px-4 sm:px-6 lg:px-8 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/70"
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Row 1 — navigation */}
              <div className="flex items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Daily sheet sections"
                  className="flex items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/80 p-1 shadow-inner"
                >
                  {TAB_CONFIG.map((tab) => (
                    <TabButton
                      key={tab.name}
                      tab={tab}
                      activeTab={activeTab}
                      onClick={handleTabChange}
                    />
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.span
                    key={activeMeta.name}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.18 }}
                    className="hidden truncate text-xs text-gray-500 md:inline"
                  >
                    {activeMeta.description}
                  </motion.span>
                </AnimatePresence>
              </div>

              {/* Row 2 — lifecycle controls (flips to reveal success/error logs) */}
              <div className="mt-2 border-t border-gray-100 pt-2">
                <ContextBarFlip onCta={handleCta}>
                  <DailySheetGlobalControls />
                </ContextBarFlip>
              </div>

            </motion.div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                role="tabpanel"
                className="min-h-[80vh]"
                variants={contentVariants}
                initial="exit"
                animate="enter"
                exit="exit"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </DailySheetProvider>
  );
}