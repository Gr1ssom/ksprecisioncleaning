"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/session";
import pkg from "../../package.json";

type Item = { href: string; label: string; icon: string; min: Role; mobile?: boolean };
const ITEMS: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", min: "STAFF", mobile: true },
  { href: "/checkin", label: "Check in", icon: "📍", min: "STAFF", mobile: true },
  { href: "/jobs", label: "Jobs", icon: "🧹", min: "STAFF", mobile: true },
  { href: "/locations", label: "Locations", icon: "🏢", min: "STAFF", mobile: true },
  { href: "/sops", label: "SOPs", icon: "📘", min: "STAFF" },
  { href: "/issues", label: "Issues", icon: "⚠️", min: "STAFF" },
  { href: "/time", label: "Hours", icon: "⏱️", min: "STAFF", mobile: true },
  { href: "/inventory", label: "Inventory", icon: "📦", min: "MANAGER" },
  { href: "/reports", label: "Reports", icon: "📊", min: "MANAGER" },
  { href: "/clients", label: "Clients", icon: "🤝", min: "MANAGER" },
  { href: "/invoices", label: "Invoices", icon: "🧾", min: "MANAGER" },
  { href: "/team", label: "Team", icon: "👥", min: "MANAGER" },
  { href: "/settings", label: "Settings", icon: "⚙️", min: "MANAGER" },
  { href: "/payroll", label: "Payroll", icon: "💵", min: "OWNER" },
];
const rank = { STAFF: 1, MANAGER: 2, OWNER: 3 } as const;

export function Nav({ role, name, logout }: { role: Role; name: string; logout: () => Promise<void> }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => rank[role] >= rank[i.min]);
  const active = (h: string) => path === h || path.startsWith(h + "/");
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-surface md:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="text-sm font-bold leading-tight">KS Precision</div>
            <div className="text-xs text-slate-500">Cleaning</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((i) => (
            <Link key={i.href} href={i.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active(i.href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="w-5 text-center">{i.icon}</span>{i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="text-sm font-medium">{name}</div>
          <div className="mb-2 text-xs capitalize text-slate-500">{role.toLowerCase()}</div>
          <div className="flex items-center justify-between">
            <form action={logout}><button className="text-xs text-slate-500 hover:text-red-600">Sign out</button></form>
            <span className="text-[11px] text-slate-400">v{pkg.version}</span>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-7 w-7" /><span className="font-bold">KSPC</span></div>
        <details className="relative">
          <summary className="btn-secondary list-none">☰ Menu</summary>
          <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-surface p-2 shadow-lg">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className="flex gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><span>{i.icon}</span>{i.label}</Link>
            ))}
            <form action={logout} className="border-t border-slate-100 px-3 pt-2"><button className="text-sm text-red-600">Sign out ({name})</button></form>
          </div>
        </details>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-surface md:hidden">
        {items.filter((i) => i.mobile).map((i) => (
          <Link key={i.href} href={i.href} className={`flex flex-col items-center py-2 text-[11px] ${active(i.href) ? "text-brand-600 font-semibold" : "text-slate-500"}`}>
            <span className="text-lg">{i.icon}</span>{i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
