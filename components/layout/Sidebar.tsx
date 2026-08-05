"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar — icon + label navigation for every current page.
// Self-contained: a static nav list gated by the signed-in user's role /
// permissions. Desktop collapses to an icon rail (hover tooltips); mobile is a
// slide-in drawer.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Utensils,
  BookOpen,
  Boxes,
  Settings,
  GitBranch,
  Server,
  LogOut,
  Menu,
  X,
  Route,
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
  Bike,
  ChefHat,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import { usePOSStore } from "@/stores/posStore";
import { hasPermission } from "@/types/admin.types";
import type { AdminPermission, AdminRole } from "@/types/admin.types";

const NAV_ICON_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Nav registry — one entry per real page route. `perms` / `roles` gate
// visibility; an item with neither is shown to everyone. super_admin sees all.
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  perms?: AdminPermission[];
  roles?: AdminRole[];
  /**
   * A hub setting that must be on for this door to be offered, on top of the
   * permission check. Phase 16 §3: `showTakeaway` / `showDelivery` used to hide
   * a tab inside the hub; the tab is gone, so they gate the page instead.
   * A restaurant that does no delivery should not carry a Delivery link.
   */
  setting?: 'showTakeaway' | 'showDelivery';
}

// Each `perms` entry MUST match the guard on the page it links to - see the
// RequirePermission wrapper in the corresponding app/**/page.tsx. A link that
// is visible but leads to a redirect is worse than no link, because the user
// concludes the software is broken rather than that the door is not theirs.
const NAV_ITEMS: NavItem[] = [
  // The four workspaces, in the order a shift uses them.
  { href: "/dine-in", label: "Dine-In", icon: <Utensils size={NAV_ICON_SIZE} />, perms: ["manage_orders"] },
  { href: "/takeaway", label: "Takeaway", icon: <ShoppingBag size={NAV_ICON_SIZE} />, perms: ["manage_takeaway"], setting: "showTakeaway" },
  { href: "/delivery", label: "Delivery", icon: <Bike size={NAV_ICON_SIZE} />, perms: ["manage_delivery"], setting: "showDelivery" },
  { href: "/kitchen", label: "Kitchen", icon: <ChefHat size={NAV_ICON_SIZE} />, perms: ["view_kitchen"] },
  { href: "/daily-sheet", label: "Daily Sheet", icon: <BookOpen size={NAV_ICON_SIZE} />, perms: ["view_reports"] },
  { href: "/analytics", label: "Analytics", icon: <BarChart3 size={NAV_ICON_SIZE} />, perms: ["view_reports"] },
  { href: "/admin/inventory", label: "Inventory", icon: <Boxes size={NAV_ICON_SIZE} />, perms: ["manage_inventory"] },
  { href: "/admin/manage", label: "Admin", icon: <Settings size={NAV_ICON_SIZE} />, perms: ["manage_menu"] },
  { href: "/peer-management", label: "Peers", icon: <GitBranch size={NAV_ICON_SIZE} />, perms: ["manage_staff"] },
  // Deliberately ungated: the server screen is the recovery surface, and it is
  // public by design - see app/server-management/page.tsx.
  { href: "/server-management", label: "Server", icon: <Server size={NAV_ICON_SIZE} /> },
];

function useVisibleNavItems(): NavItem[] {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const perms = session?.user?.permissions;
  const hub = usePOSStore((s) => s.settings?.hub);

  return useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      // A workspace the restaurant has switched off is not offered to anyone,
      // super_admin included — the point is that the site does not do it.
      // Undefined settings (not loaded yet) mean "on", so the rail does not
      // flicker items in on a slow settings fetch.
      if (item.setting && hub && hub[item.setting] === false) return false;
      if (role === "super_admin") return true; // super admin sees everything
      if (!item.roles && !item.perms) return true; // ungated
      const roleOk = item.roles ? item.roles.includes(role as AdminRole) : false;
      // hasPermission() rather than a bare .includes(): it falls back to the
      // role's defaults, so a session minted before permissions were resolved
      // at sign-in still shows the right nav instead of an empty rail.
      const permOk = item.perms ? item.perms.some((p) => hasPermission(role, perms, p)) : false;
      return roleOk || permOk;
    });
  }, [role, perms, hub]);
}

/** Home matches only the exact root; every other item matches itself + subpaths. */
function isRouteActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Item (Link) — Desktop
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  isActive?: boolean;
  isDarkTheme?: boolean;
  collapsed?: boolean;
}

function SidebarItem({ icon, label, href, isActive, isDarkTheme = true, collapsed = true }: SidebarItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const activeBg = isActive
    ? "bg-cyan-500/15 text-cyan-400"
    : isDarkTheme
      ? "text-gray-400 hover:bg-white/5 hover:text-white"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  return (
    <Link
      href={href}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group block"
      aria-label={label}
      title={collapsed ? undefined : label}
    >
      <motion.div
        className={`relative flex h-10 items-center rounded-xl transition-colors duration-200 ${
          collapsed ? "w-10 justify-center mx-auto" : "w-full gap-3 px-3"
        } ${activeBg}`}
        whileTap={{ scale: 0.96 }}
      >
        <span className="shrink-0">{icon}</span>
        {!collapsed && <span className="truncate text-sm font-medium">{label}</span>}

        {isActive && (
          <motion.div
            layoutId="activeIndicator"
            className="absolute -left-px top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-cyan-400"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        )}
      </motion.div>

      {/* Hover tooltip — only when collapsed */}
      <AnimatePresence>
        {collapsed && isHovered && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12 }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none"
          >
            <div
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium shadow-lg border ${
                isDarkTheme ? "bg-slate-800 text-white border-white/10" : "bg-white text-gray-900 border-gray-200"
              }`}
            >
              {label}
              <div
                className={`absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent ${
                  isDarkTheme ? "border-r-slate-800" : "border-r-white"
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar Button (Action) — Logout
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isLoading?: boolean;
  variant?: "default" | "danger";
  isDarkTheme?: boolean;
  collapsed?: boolean;
}

function SidebarButton({ icon, label, onClick, isLoading, variant = "default", isDarkTheme = true, collapsed = true }: SidebarButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const variantClasses =
    variant === "danger"
      ? isDarkTheme
        ? "text-gray-400 hover:bg-red-500/10 hover:text-red-400"
        : "text-gray-500 hover:bg-red-50 hover:text-red-500"
      : isDarkTheme
        ? "text-gray-400 hover:bg-white/5 hover:text-white"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900";

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative group block w-full"
      aria-label={label}
      title={collapsed ? undefined : label}
    >
      <motion.div
        className={`flex h-10 items-center rounded-xl transition-colors duration-200 ${
          collapsed ? "w-10 justify-center mx-auto" : "w-full gap-3 px-3"
        } ${variantClasses} ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        whileTap={{ scale: 0.96 }}
      >
        <span className="shrink-0">
          {isLoading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
        </span>
        {!collapsed && <span className="truncate text-sm font-medium">{label}</span>}
      </motion.div>

      <AnimatePresence>
        {collapsed && isHovered && !isLoading && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12 }}
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none"
          >
            <div
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium shadow-lg border ${
                variant === "danger"
                  ? isDarkTheme
                    ? "bg-red-950 text-red-400 border-red-500/20"
                    : "bg-red-50 text-red-500 border-red-200"
                  : isDarkTheme
                    ? "bg-slate-800 text-white border-white/10"
                    : "bg-white text-gray-900 border-gray-200"
              }`}
            >
              {label}
              <div
                className={`absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent ${
                  variant === "danger"
                    ? isDarkTheme ? "border-r-red-950" : "border-r-red-50"
                    : isDarkTheme ? "border-r-slate-800" : "border-r-white"
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme by pathname
//
// The rail sits directly against the page, so it has to be the page's own
// colour. When it is not, the seam reads as a rendering fault: a white rail
// beside the black admin screen, or beside the near-black POS floor, looks like
// something failed to load rather than like a design.
//
// One entry per route family, and the colour is the page's ACTUAL background —
// checked against the page, not guessed. Add a route here when you add a page;
// the default is the light rail because most report screens are light.
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarTheme {
  bg: string;
  border: string;
}

const LIGHT_RAIL: SidebarTheme = { bg: "bg-white", border: "border-gray-200" };

/** Longest matching prefix wins, so `/admin/inventory` picks up `/admin`. */
const SIDEBAR_THEMES: { match: (p: string) => boolean; theme: SidebarTheme }[] = [
  // Home — bg-slate-950.
  { match: (p) => p === "/", theme: { bg: "bg-slate-950", border: "border-white/10" } },

  // The four POS workspaces — bg-gray-950. /kitchen hides the rail entirely,
  // but it is listed so the two never disagree if that changes.
  {
    match: (p) =>
      p.startsWith("/dine-in") ||
      p.startsWith("/hub") ||
      p.startsWith("/takeaway") ||
      p.startsWith("/delivery") ||
      p.startsWith("/kitchen"),
    theme: { bg: "bg-gray-950", border: "border-white/10" },
  },

  // Admin and the server screen — both bg-black.
  {
    match: (p) => p.startsWith("/admin") || p.startsWith("/server-management"),
    theme: { bg: "bg-black", border: "border-white/10" },
  },

  // Peer management is a WHITE page. It used to get the dark rail, which was
  // the same mismatch in the other direction.
  { match: (p) => p.startsWith("/peer-management"), theme: LIGHT_RAIL },
];

function getSidebarBg(pathname: string): SidebarTheme {
  return SIDEBAR_THEMES.find((t) => t.match(pathname))?.theme ?? LIGHT_RAIL;
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function DesktopSidebar() {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { status } = useSession();
  const { collapsed, toggle } = useSidebarCollapsed();

  const navItems = useVisibleNavItems();
  const theme = getSidebarBg(pathname);
  const isDarkTheme = theme.bg !== "bg-white";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/login" });
  };

  const widthStyle = { width: "var(--sidebar-w, 64px)" } as React.CSSProperties;

  return (
    <aside
      style={widthStyle}
      className={`hidden lg:flex fixed left-0 top-0 z-40 h-screen flex-col overflow-hidden transition-[width,background-color,border-color] duration-300 ease-out ${theme.bg} border-r ${theme.border}`}
      aria-label="Primary navigation"
    >
      {/* Header: always shows a show/hide toggle. Expanded → brand + collapse (◀);
          collapsed → a single prominent expand (▶) button. */}
      <div
        className={`flex h-16 items-center border-b transition-colors duration-500 ${
          collapsed ? "justify-center px-2" : "justify-between px-3"
        } ${isDarkTheme ? "border-white/5" : "border-gray-100"}`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
              isDarkTheme ? "bg-white/5 text-cyan-400 hover:bg-white/10" : "bg-gray-100 text-cyan-600 hover:bg-gray-200"
            }`}
          >
            <ChevronsRight size={18} />
          </button>
        ) : (
          <>
            <Link
              href="/"
              className={`flex flex-1 min-w-0 items-center gap-2 rounded-xl ${isDarkTheme ? "text-white" : "text-gray-900"}`}
              aria-label="Home"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  isDarkTheme ? "bg-white/5 text-cyan-400" : "bg-gray-100 text-cyan-600"
                }`}
              >
                <Route size={18} />
              </span>
              <span className="truncate text-sm font-semibold tracking-tight">XenithPulse</span>
            </Link>

            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                isDarkTheme ? "text-gray-400 hover:bg-white/5 hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <ChevronsLeft size={16} />
            </button>
          </>
        )}
      </div>

      {/* Main Navigation */}
      <nav className={`flex flex-1 flex-col gap-1 overflow-y-auto py-3 px-2 scrollbar-thin ${collapsed ? "overflow-hidden" : ""}`}>
        {status === "loading"
          ? [...Array(5)].map((_, i) => <div key={i} className="h-10 w-full rounded-xl bg-white/5 animate-pulse" />)
          : navItems.map((item) => (
              <SidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={isRouteActive(item.href, pathname)}
                isDarkTheme={isDarkTheme}
                collapsed={collapsed}
              />
            ))}
      </nav>

      {/* Footer: Logout (the show/hide toggle lives in the header) */}
      <div className={`flex flex-col gap-1 px-2 py-3 border-t transition-colors duration-500 ${isDarkTheme ? "border-white/5" : "border-gray-100"}`}>
        <SidebarButton icon={<LogOut size={20} />} label="Sign Out" onClick={handleLogout} isLoading={isLoggingOut} variant="danger" isDarkTheme={isDarkTheme} collapsed={collapsed} />
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function MobileSidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const navItems = useVisibleNavItems();
  const theme = getSidebarBg(pathname);
  const isDarkTheme = theme.bg !== "bg-white";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOut({ callbackUrl: "/login" });
  };

  const handleToggle = () => setIsSidebarOpen((v) => !v);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsSidebarOpen(false);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsSidebarOpen(false);
    };
    if (isSidebarOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSidebarOpen]);

  return (
    <>
      {/* Floating Menu Button */}
      <motion.button
        onClick={handleToggle}
        className={`lg:hidden fixed top-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg border transition-colors duration-500 ${
          isDarkTheme ? "bg-slate-900 text-white border-white/10" : "bg-white text-gray-900 border-gray-200"
        }`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open menu"
      >
        {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
      </motion.button>

      {/* Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleToggle}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside
            ref={menuRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`fixed top-0 right-0 h-screen w-72 flex flex-col z-60 transition-colors duration-500 ${theme.bg} border-l ${theme.border}`}
          >
            <div className={`flex items-center justify-between h-16 px-4 border-b ${isDarkTheme ? "border-white/5" : "border-gray-100"}`}>
              <span className={`text-lg font-semibold ${isDarkTheme ? "text-white" : "text-gray-900"}`}>Menu</span>
              <motion.button
                onClick={handleToggle}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  isDarkTheme ? "text-gray-400 hover:bg-white/5 hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="Close menu"
              >
                <X size={20} />
              </motion.button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 px-3">
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = isRouteActive(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleToggle}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                        isActive
                          ? "bg-cyan-500/20 text-cyan-400"
                          : isDarkTheme
                            ? "text-gray-400 hover:bg-white/5 hover:text-white"
                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="text-sm font-medium">{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="mobileActiveIndicator"
                          className="ml-auto h-2 w-2 rounded-full bg-cyan-400"
                          initial={false}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className={`p-4 border-t ${isDarkTheme ? "border-white/5" : "border-gray-100"}`}>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isDarkTheme ? "text-gray-400 hover:bg-red-500/10 hover:text-red-400" : "text-gray-500 hover:bg-red-50 hover:text-red-500"
                } ${isLoggingOut ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isLoggingOut ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <LogOut size={20} />
                )}
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Responsive export
// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile ? <MobileSidebar /> : <DesktopSidebar />;
}
