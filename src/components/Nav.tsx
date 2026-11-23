"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, MapPin, CalendarDays, Building2, BookOpen, TriangleAlert, Clock, Package,
  BarChart3, Handshake, Receipt, Users, Settings, Wallet, Menu, X, LogOut, History, UserCog, type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/session";
import { Logo } from "./Logo";
import pkg from "../../package.json";

type Item = { href: string; label: string; icon: LucideIcon; min: Role; mobile?: boolean };
const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, min: "STAFF", mobile: true },
  { href: "/checkin", label: "Check in", icon: MapPin, min: "STAFF", mobile: true },
  { href: "/jobs", label: "Jobs", icon: CalendarDays, min: "STAFF", mobile: true },
  { href: "/locations", label: "Locations", icon: Building2, min: "STAFF", mobile: true },
  { href: "/sops", label: "SOPs", icon: BookOpen, min: "STAFF" },
  { href: "/issues", label: "Issues", icon: TriangleAlert, min: "STAFF" },
  { href: "/time", label: "Hours", icon: Clock, min: "STAFF" },
  { href: "/inventory", label: "Inventory", icon: Package, min: "MANAGER" },
  { href: "/reports", label: "Reports", icon: BarChart3, min: "MANAGER" },
  { href: "/clients", label: "Clients", icon: Handshake, min: "MANAGER" },
  { href: "/invoices", label: "Invoices", icon: Receipt, min: "MANAGER" },
  { href: "/team", label: "Team", icon: Users, min: "MANAGER" },
  { href: "/settings", label: "Settings", icon: Settings, min: "MANAGER" },
  { href: "/payroll", label: "Payroll", icon: Wallet, min: "OWNER" },
  { href: "/activity", label: "Activity", icon: History, min: "OWNER" },
  { href: "/account", label: "My account", icon: UserCog, min: "STAFF" },
];
const rank = { STAFF: 1, MANAGER: 2, OWNER: 3 } as const;

export function Nav({ role, name, logout }: { role: Role; name: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => rank[role] >= rank[i.min]);
  const active = (h: string) => path === h || path.startsWith(h + "/");
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);
  const tabs = items.filter((i) => i.mobile);
  const moreActive = !tabs.some((t) => active(t.href));
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-surface md:flex">
        <Link href="/dashboard" className="block px-6 pb-4 pt-6 text-slate-900">
          <Logo variant="mark" className="w-full" />
          <div className="eyebrow mt-2 text-center text-[9px]">Residential | Commercial</div>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto border-t border-slate-200 p-3">
          {items.map((i) => (
            <Link key={i.href} href={i.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active(i.href) ? "bg-ink font-semibold text-paper" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              <i.icon className="h-4 w-4 shrink-0" strokeWidth={active(i.href) ? 2.25 : 1.75} />{i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="text-sm font-semibold">{name}</div>
          <div className="eyebrow mb-2 text-[10px]">{role.toLowerCase()}</div>
          <div className="flex items-center justify-between">
            <form action={logout}><button className="text-xs text-slate-500 hover:text-red-600">Sign out</button></form>
            <span className="text-[11px] text-slate-400">v{pkg.version}</span>
          </div>
        </div>
      </aside>

      {/* Phone: slim top bar + bottom tabs, like a native app. */}
      <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-surface/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-center px-4">
          <Link href="/dashboard" className="flex h-12 items-center text-slate-900" aria-label="Dashboard"><Logo variant="mark" className="h-9 w-auto" /></Link>
        </div>
      </header>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {tabs.map((i) => (
            <Link key={i.href} href={i.href} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${active(i.href) ? "text-slate-900" : "text-slate-400"}`}>
              <i.icon className="h-6 w-6" strokeWidth={active(i.href) ? 2.25 : 1.75} />{i.label}
            </Link>
          ))}
          <button onClick={() => setMore((m) => !m)} aria-expanded={more}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${more || moreActive ? "text-slate-900" : "text-slate-400"}`}>
            {more ? <X className="h-6 w-6" strokeWidth={2.25} /> : <Menu className="h-6 w-6" strokeWidth={moreActive ? 2.25 : 1.75} />}More
          </button>
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setMore(false)}>
          <div className="pt-safe absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface pb-[calc(4.5rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div><div className="font-semibold">{name}</div><div className="eyebrow text-[10px]">{role.toLowerCase()} · v{pkg.version}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pb-3">
              {items.filter((i) => !i.mobile).map((i) => (
                <Link key={i.href} href={i.href}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-xs font-semibold ${active(i.href) ? "border-ink bg-ink text-paper" : "border-slate-200 text-slate-800 active:bg-slate-100"}`}>
                  <i.icon className="h-6 w-6" strokeWidth={1.75} />{i.label}
                </Link>
              ))}
            </div>
            <form action={logout} className="px-4">
              <button className="btn-secondary w-full text-red-600"><LogOut className="h-4 w-4" />Sign out</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
