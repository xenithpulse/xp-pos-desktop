"use client";

import React, { useEffect, useMemo, useState, JSX } from "react";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import AccessControl from "@/components/layout/AccessControl";
import LicenseNotice from "@/components/layout/LicenseNotice";
import { AdminPermission } from "@/models/schemas/admin.schema";
import { usePOSStore } from "@/stores/posStore";
import {
  useSidebarCollapsed,
  SIDEBAR_WIDTH_COLLAPSED,
  SIDEBAR_WIDTH_EXPANDED,
} from "@/lib/hooks/useSidebarCollapsed";

// ==================== ROUTE ACCESS CONFIGURATION ====================
// Define role and permission requirements for each route
// Routes not listed here will be accessible to all authenticated users
interface RouteAccessConfig {
  allowedRoles?: string[];
  requiredPermissions?: AdminPermission[];
}

const ROUTE_ACCESS_CONFIG: Record<string, RouteAccessConfig> = {
  // Super admin only routes
  "/daily-sheet": { allowedRoles: ["super_admin", "manager"] },
  "/hub": { allowedRoles: ["super_admin", "manager"] },
  "/analytics": { allowedRoles: ["super_admin"] },
  "/system-overview": { allowedRoles: ["super_admin"] },
  "/messenger": { allowedRoles: ["super_admin"] },
  "/peer-management": { allowedRoles: ["super_admin", "manager"] },
  "/notifications": { allowedRoles: ["super_admin"] },
};

// Helper function to get access config for a route (supports nested routes)
function getRouteAccessConfig(pathname: string): RouteAccessConfig {
  // First, check for exact match
  if (ROUTE_ACCESS_CONFIG[pathname]) {
    return ROUTE_ACCESS_CONFIG[pathname];
  }
  
  // Then check for parent route match (e.g., /bookings/123 matches /bookings)
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const parentPath = '/' + segments.slice(0, i).join('/');
    if (ROUTE_ACCESS_CONFIG[parentPath]) {
      return ROUTE_ACCESS_CONFIG[parentPath];
    }
  }
  
  // No restrictions found
  return {};
}

// Routes that render WITHOUT requiring a signed-in session. `/server-management`
// is intentionally public: it's the recovery/handover surface, reachable even
// when nobody can log in (e.g. right after a network change).
const PUBLIC_ROUTES = ["/login", "/server-management"];
function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}

const SHOW_BEFORE = 2 * 60 * 1000; // 2 minutes
const URGENT_THRESHOLD = 30 * 1000; // 30 seconds
const TICK_INTERVAL = 1000; // 1 second

function formatMsToMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// Icon for the toast
const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-6 w-6"
  >
    <path
      fillRule="evenodd"
      d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6l3.75 2.25a.75.75 0 10.75-1.23l-3-1.8V6z"
      clipRule="evenodd"
    />
  </svg>
);

function SessionTimeoutToast(): JSX.Element | null {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);

  const expiryTs = useMemo(() => {
    if (!session || !session.expires) return null;
    const t = Date.parse(session.expires);
    return Number.isFinite(t) ? t : null;
  }, [session]);

  useEffect(() => {
    if (status === "unauthenticated" && !isPublicRoute(pathname)) {
      router.push("/login");
      return;
    }
  }, [status, router, pathname]);

  useEffect(() => {
    if (!expiryTs) {
      setRemainingMs(null);
      setVisible(false);
      return;
    }

    const computeAndMaybeShow = () => {
      const rem = expiryTs - Date.now();
      setRemainingMs(rem);
      if (rem <= 0) {
        void signOut({ callbackUrl: "/login" });
        return;
      }
      setVisible(rem <= SHOW_BEFORE);
    };

    computeAndMaybeShow();

    const iv = setInterval(() => {
      const rem = expiryTs - Date.now();
      setRemainingMs(rem);
      if (rem <= 0) {
        clearInterval(iv);
        void signOut({ callbackUrl: "/login" });
        return;
      }
      if (rem <= SHOW_BEFORE) setVisible(true);
    }, TICK_INTERVAL);

    return () => clearInterval(iv);
  }, [expiryTs]);

  if (!visible || remainingMs === null) return null;

  // Dynamically determine the color class based on remaining time
  let colorClass = "text-blue-600 border-blue-500 bg-blue-50";
  let message = "Session expiring soon";

  if (remainingMs <= URGENT_THRESHOLD) {
    colorClass = "text-red-600 border-red-500 bg-red-50";
    message = "Session is about to expire!";
  } else if (remainingMs <= SHOW_BEFORE) {
    colorClass = "text-yellow-600 border-yellow-500 bg-yellow-50";
    message = "Your session will expire in...";
  }

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed top-4 left-4 right-4 z-9999 w-auto max-w-2xl sm:left-auto sm:w-full transition-opacity duration-300 ease-in-out"
    >
      <div
        className={`pointer-events-auto rounded-xl border-l-4 p-4 shadow-lg backdrop-blur-md ${colorClass} transform hover:scale-[1.01] transition-transform duration-200`}
      >
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <ClockIcon />
          <div className="flex-1">
            <p className="font-semibold">{message}</p>
            <p className="text-sm">
              <span className="font-mono text-xl font-bold">
                {formatMsToMmSs(remainingMs)}
              </span>{" "}
              remaining
            </p>
          </div>
          <button
            onClick={() => void signOut({ callbackUrl: "/login" })}
            className="shrink-0 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors duration-200 hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-opacity-50 sm:px-4"
            aria-label="Sign out now"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarWithToggle() {
  const sidebarVisible = usePOSStore((s) => s.sidebarVisible);
  const pathname = usePathname();
  const isHubPage = pathname === "/hub";
  // Kitchen display: full-screen ticket board, never needs the admin nav.
  const isKitchenPage = pathname === "/kitchen";

  // On the hub page, respect the toggle. On other pages always show.
  if (isKitchenPage) return null;
  if (isHubPage && !sidebarVisible) return null;
  return <Sidebar />;
}

function MainContentWithToggle({
  accessConfig,
  children,
}: {
  accessConfig: { allowedRoles?: string[]; requiredPermissions?: AdminPermission[] };
  children: React.ReactNode;
}) {
  const sidebarVisible = usePOSStore((s) => s.sidebarVisible);
  const pathname = usePathname();
  const isHubPage = pathname === "/hub";
  const isKitchenPage = pathname === "/kitchen";
  const hideSidebar = isKitchenPage || (isHubPage && !sidebarVisible);

  // Shift the content in lockstep with the sidebar's collapsed/expanded width.
  // Only applies on desktop (≥lg) — on mobile the sidebar is an overlay drawer.
  const { collapsed } = useSidebarCollapsed();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const marginLeft =
    isDesktop && !hideSidebar
      ? collapsed
        ? SIDEBAR_WIDTH_COLLAPSED
        : SIDEBAR_WIDTH_EXPANDED
      : 0;

  return (
    <main
      style={{ marginLeft }}
      className="flex-1 p-0 overflow-auto text-black transition-[margin] duration-300 ease-out"
    >
      {/* OUTSIDE AccessControl on purpose. A waiter who lands on a page their
          role cannot open still needs to be told the POS is about to stop
          taking new orders - and AccessControl replaces its children entirely.
          It renders nothing at all on a licensed box. */}
      <LicenseNotice />
      <AccessControl
        allowedRoles={accessConfig.allowedRoles ?? []}
        requiredPermissions={accessConfig.requiredPermissions ?? []}
      >
        {children}
      </AccessControl>
    </main>
  );
}

function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicPage = isPublicRoute(pathname);

  // Get access configuration for current route
  const accessConfig = useMemo(() => {
    return getRouteAccessConfig(pathname ?? "");
  }, [pathname]);

  useEffect(() => {
    if (status === "unauthenticated" && !isPublicPage) {
      router.replace("/login");
    }
  }, [status, router, isPublicPage]);

  // Public pages (login, server-management): render standalone, no sidebar/auth
  if (isPublicPage) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-700 text-lg font-medium">
        Loading…
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full">
      <SidebarWithToggle />
      <MainContentWithToggle accessConfig={accessConfig}>
        {children}
      </MainContentWithToggle>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    document.body.dataset.page = pathname ?? "";
  }, [pathname]);

  const isBlackBackground = useMemo(() => {
    return pathname === "/" || pathname === "/home" || pathname === "/dashboard";
  }, [pathname]);

  return (
    <html lang="en">
      <head />
      <body className={`${isBlackBackground ? "bg-black text-black" : "bg-white text-black"} font-sans`}>
        <SessionProvider>
          <SessionTimeoutToast />
          <AuthLayoutWrapper>{children}</AuthLayoutWrapper>
        </SessionProvider>
      </body>
    </html>
  );
}
