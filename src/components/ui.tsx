import Link from "next/link";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, href, tone = "slate" }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: "slate" | "red" | "green" | "amber" | "blue" }) {
  const tones = { slate: "text-slate-900", red: "text-red-600", green: "text-emerald-600", amber: "text-amber-600", blue: "text-brand-600" };
  const body = (
    <div className="card h-full">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{body}</Link> : body;
}

const STATUS: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-blue-100 text-blue-700", COMPLETED: "bg-emerald-100 text-emerald-700",
  MISSED: "bg-red-100 text-red-700", CANCELLED: "bg-slate-100 text-slate-400", DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700", PAID: "bg-emerald-100 text-emerald-700", VOID: "bg-slate-100 text-slate-400",
  OPEN: "bg-amber-100 text-amber-700", RESOLVED: "bg-emerald-100 text-emerald-700",
  SUPPLY_PICKUP: "bg-purple-100 text-purple-700", SITE_IN: "bg-emerald-100 text-emerald-700", SITE_OUT: "bg-slate-200 text-slate-700",
  STAFF: "bg-slate-100 text-slate-700", MANAGER: "bg-blue-100 text-blue-700", OWNER: "bg-amber-100 text-amber-800",
};
export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={`badge ${STATUS[value] ?? "bg-slate-100 text-slate-700"}`}>{label ?? value.replace(/_/g, " ").toLowerCase()}</span>;
}

export function FenceBadge({ within, distance }: { within: boolean | null; distance: number | null }) {
  if (within == null) return <span className="badge bg-slate-100 text-slate-500">no GPS</span>;
  return within
    ? <span className="badge bg-emerald-100 text-emerald-700">✓ on site{distance != null ? ` · ${distance}m` : ""}</span>
    : <span className="badge bg-red-100 text-red-700">⚠ {distance}m away</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}
