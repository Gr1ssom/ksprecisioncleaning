"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/session";
import { onPage, tabsFor } from "@/lib/nav";

/** Tabs across the top of pages that share one sidebar entry (e.g. Clients | Locations | SOPs). */
export function SectionTabs({ role }: { role: Role }) {
  const path = usePathname();
  const tabs = tabsFor(role, path);
  if (!tabs.length) return null;
  return (
    <nav aria-label="Section" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 print:hidden">
      {tabs.map((t) => {
        const on = onPage(path, t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={`chip shrink-0 gap-2 border ${on ? "border-ink bg-ink text-paper" : "border-slate-300 bg-surface text-slate-700 hover:border-ink"}`}>
            <t.icon className="h-4 w-4" strokeWidth={on ? 2.25 : 1.75} />{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
