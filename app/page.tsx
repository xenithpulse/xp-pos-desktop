'use client';

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  MapPin, Clock, Sparkles, Cloud, Sun, CloudRain, CloudSnow, CloudLightning, Quote,
  Utensils, BookOpen, Boxes, Settings, Server, GitBranch, ArrowUpRight,
  ShoppingBag, Bike, ChefHat,
} from "lucide-react";
import { erp_business_type, erp_version } from "@/config/system_info";
import { hasPermission, type AdminPermission } from "@/types/admin.types";
import { usePOSStore } from "@/stores/posStore";

// ─── Inspirational quotes (kept from the previous home screen) ───────────────
const quotes = [
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "If you cannot measure it, you cannot improve it.", author: "Peter Drucker" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "Take care of your guests and the business takes care of itself.", author: "Restaurant proverb" },
];

type WeatherData = { temp: number; condition: string; icon: string } | null;

// ─── Redirection targets (only routes that exist as pages) ───────────────────
type Accent = "cyan" | "emerald" | "amber" | "violet" | "sky" | "rose";

// Every tile carries the permission it needs, and the grid is filtered against
// the signed-in user before it renders.
//
// This is presentation, not security - the pages themselves are guarded (see
// components/auth/RequirePermission.tsx) and the APIs behind them are guarded
// again on the server. What it prevents is a screen full of doors that open
// onto a redirect: a delivery rider seeing "Admin" and "Server" learns nothing
// except that this software is not for them.
//
// `perm: null` means everyone signed in.
const QUICK_LINKS: {
  href: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  accent: Accent;
  perm: AdminPermission | null;
  /** Hub setting that must be on for this tile to appear. See Sidebar.NavItem. */
  setting?: 'showTakeaway' | 'showDelivery';
}[] = [
  { href: "/dine-in", label: "Dine-In", desc: "Take orders, manage tables & the floor", icon: <Utensils size={20} />, accent: "cyan", perm: "manage_orders" },
  { href: "/takeaway", label: "Takeaway", desc: "Orders collected at the counter", icon: <ShoppingBag size={20} />, accent: "emerald", perm: "manage_takeaway", setting: "showTakeaway" },
  { href: "/delivery", label: "Delivery", desc: "Orders going out for delivery", icon: <Bike size={20} />, accent: "sky", perm: "manage_delivery", setting: "showDelivery" },
  { href: "/kitchen", label: "Kitchen Display", desc: "Live ticket board for the pass", icon: <ChefHat size={20} />, accent: "amber", perm: "view_kitchen" },
  { href: "/daily-sheet", label: "Daily Sheet", desc: "Open the day, record income & expenses", icon: <BookOpen size={20} />, accent: "emerald", perm: "view_reports" },
  { href: "/admin/inventory", label: "Inventory", desc: "Stock levels, valuation & alerts", icon: <Boxes size={20} />, accent: "amber", perm: "manage_inventory" },
  { href: "/admin/manage", label: "Admin", desc: "Menu, tables, categories & stock items", icon: <Settings size={20} />, accent: "violet", perm: "manage_menu" },
  { href: "/peer-management", label: "Peers", desc: "Staff accounts & connected devices", icon: <GitBranch size={20} />, accent: "sky", perm: "manage_staff" },
  { href: "/server-management", label: "Server", desc: "Backups & server control", icon: <Server size={20} />, accent: "rose", perm: null },
];

// Accent token map — one place so links stay consistent.
const ACCENT: Record<Accent, { chip: string; ring: string; glow: string }> = {
  cyan:    { chip: "bg-cyan-500/15 text-cyan-300",       ring: "group-hover:border-cyan-400/40",    glow: "group-hover:shadow-cyan-500/10" },
  emerald: { chip: "bg-emerald-500/15 text-emerald-300", ring: "group-hover:border-emerald-400/40", glow: "group-hover:shadow-emerald-500/10" },
  amber:   { chip: "bg-amber-500/15 text-amber-300",     ring: "group-hover:border-amber-400/40",   glow: "group-hover:shadow-amber-500/10" },
  violet:  { chip: "bg-violet-500/15 text-violet-300",   ring: "group-hover:border-violet-400/40",  glow: "group-hover:shadow-violet-500/10" },
  sky:     { chip: "bg-sky-500/15 text-sky-300",         ring: "group-hover:border-sky-400/40",     glow: "group-hover:shadow-sky-500/10" },
  rose:    { chip: "bg-rose-500/15 text-rose-300",       ring: "group-hover:border-rose-400/40",    glow: "group-hover:shadow-rose-500/10" },
};

export default function Home() {
  const { data: session } = useSession();
  const user = session?.user;
  const hub = usePOSStore((s) => s.settings?.hub);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [greeting, setGreeting] = useState<string>("Hello");
  const [location, setLocation] = useState<string>("Detecting…");
  const [weather, setWeather] = useState<WeatherData>(null);
  const [dailyQuote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);

  // Only the tiles this person can actually open.
  //
  // While the session is still loading, `user` is undefined and this resolves
  // to just the unrestricted tiles rather than to everything - showing the full
  // grid and then removing half of it a moment later is worse than showing a
  // small grid that grows.
  const visibleLinks = useMemo(
    () =>
      QUICK_LINKS.filter((link) => {
        // A workspace the restaurant has switched off is not offered at all.
        // Undefined settings mean "not loaded yet" → shown, same reasoning as
        // the sidebar: a tile that appears is better than one that vanishes.
        if (link.setting && hub && hub[link.setting] === false) return false;
        return link.perm === null || hasPermission(user?.role, user?.permissions, link.perm);
      }),
    [user?.role, user?.permissions, hub],
  );

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Greeting (includes afternoon)
  useEffect(() => {
    const hour = currentTime.getHours();
    if (hour >= 5 && hour < 12) setGreeting("Good Morning");
    else if (hour < 17) setGreeting("Good Afternoon");
    else if (hour < 21) setGreeting("Good Evening");
    else setGreeting("Good Night");
  }, [currentTime]);

  // Location + weather (kept from the previous home screen)
  useEffect(() => {
    if (!("geolocation" in navigator)) { setLocation("Location not supported"); return; }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || data.address?.state || "Unknown";
          const country = data.address?.country || "";
          setLocation(`${city}${country ? `, ${country}` : ""}`);
        } catch { setLocation("Location unavailable"); }
        try {
          const wr = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`);
          const wd = await wr.json();
          const temp = Math.round(wd.current.temperature_2m);
          const code = wd.current.weather_code;
          let condition = "Clear", icon = "sun";
          if (code === 0) { condition = "Clear"; icon = "sun"; }
          else if (code <= 3) { condition = "Partly Cloudy"; icon = "cloud"; }
          else if (code <= 48) { condition = "Foggy"; icon = "cloud"; }
          else if (code <= 67) { condition = "Rainy"; icon = "rain"; }
          else if (code <= 77) { condition = "Snowy"; icon = "snow"; }
          else if (code <= 99) { condition = "Stormy"; icon = "storm"; }
          setWeather({ temp, condition, icon });
        } catch { setWeather(null); }
      },
      () => setLocation("Location access denied"),
    );
  }, []);

  const WeatherIcon = ({ icon }: { icon: string }) => {
    const c = "w-5 h-5";
    switch (icon) {
      case "sun": return <Sun className={`${c} text-amber-400`} />;
      case "cloud": return <Cloud className={`${c} text-slate-400`} />;
      case "rain": return <CloudRain className={`${c} text-blue-400`} />;
      case "snow": return <CloudSnow className={`${c} text-cyan-200`} />;
      case "storm": return <CloudLightning className={`${c} text-purple-400`} />;
      default: return <Sun className={`${c} text-amber-400`} />;
    }
  };

  const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  const displayName = user?.name || "Guest";

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950 font-sans selection:bg-cyan-500/30">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8 lg:px-10">
        {/* ═══ Header ═══ */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between gap-4 border-b border-white/5 pb-5"
        >
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">XenithPulse ERP</p>
            <span className="text-[11px] tracking-wide text-white/45">{erp_version} • {erp_business_type}</span>
            <div className="mt-1.5 h-px w-16 bg-gradient-to-r from-cyan-500/50 to-transparent" />
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-white/70">
                {currentTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="flex items-center justify-end gap-1.5 text-[11px] text-white/40 tabular-nums">
                <Clock size={11} className="text-cyan-400/60" />{formatTime(currentTime)}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40">
                <span className="text-xs font-semibold uppercase text-white/80">{displayName.charAt(0)}</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-medium leading-tight text-white/75">{displayName}</p>
                <p className="text-[9px] uppercase tracking-wider text-white/40">{user?.role || "User"}</p>
              </div>
              <span className="ml-1 h-2 w-2 rounded-full bg-emerald-400/70" />
            </div>
          </div>
        </motion.header>

        {/* ═══ Greeting ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="py-10 md:py-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Sparkles size={12} className="text-cyan-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">{greeting}</span>
          </div>
          <h1 className="mt-4 text-4xl font-serif tracking-tight text-white/90 md:text-6xl">
            Welcome back, {displayName.split(" ")[0]}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/40 md:text-base">
            Pick up where you left off — jump straight to any part of the restaurant.
          </p>
        </motion.section>

        {/* ═══ Redirections ═══ */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Jump back in</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleLinks.map((link) => {
              const a = ACCENT[link.accent];
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group relative flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm shadow-lg shadow-transparent transition-all duration-200 hover:bg-white/[0.07] ${a.ring} ${a.glow}`}
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${a.chip}`}>{link.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-white/85">{link.label}</p>
                    <p className="truncate text-xs text-white/40">{link.desc}</p>
                  </div>
                  <ArrowUpRight size={18} className="shrink-0 text-white/20 transition-colors group-hover:text-white/60" />
                </Link>
              );
            })}
          </div>
        </motion.section>

        {/* ═══ Footer: weather · location · quote ═══ */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-auto flex flex-col gap-4 border-t border-white/5 pt-6 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-white/35">
              <MapPin size={12} />
              <span className="text-[11px] tracking-wide">{location}</span>
            </div>
            {weather && (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
                <WeatherIcon icon={weather.icon} />
                <span className="text-sm font-light tabular-nums text-white/85">{weather.temp}°C</span>
                <span className="text-[9px] uppercase tracking-wider text-white/40">{weather.condition}</span>
              </div>
            )}
          </div>

          <div className="flex max-w-md items-start gap-2 text-left md:justify-end">
            <Quote size={14} className="mt-0.5 shrink-0 text-cyan-400/40" />
            <div>
              <p className="text-xs italic leading-relaxed text-white/45">{dailyQuote.text}</p>
              <p className="mt-0.5 text-[10px] tracking-wide text-white/30">— {dailyQuote.author}</p>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  );
}
