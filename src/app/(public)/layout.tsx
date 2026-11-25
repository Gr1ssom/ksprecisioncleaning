import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

// Client-facing pages (visit reports, portal). Opened by a secret link: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="pt-safe border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3 text-slate-900"><Logo variant="mark" className="h-10 w-auto" /></div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-6">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-slate-500">KS Precision Cleaning LLC · Residential | Commercial</footer>
    </div>
  );
}
