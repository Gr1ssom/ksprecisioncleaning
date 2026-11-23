import { Logo } from "./Logo";

/** The logo card used by sign-in, setup, forgot password and 2-step screens. */
export function AuthCard({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main className="pt-safe flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-5 border border-slate-200 bg-surface px-8 pb-8 pt-10 shadow-sm">
        <div className="text-slate-900"><Logo className="w-full" /></div>
        <div className="flex items-center gap-3 pt-2"><span className="rule" /><span className="eyebrow">{heading}</span><span className="rule" /></div>
        {children}
      </div>
    </main>
  );
}
