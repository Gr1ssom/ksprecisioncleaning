import { Plus } from "lucide-react";
import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Assignment, Location, Profile, ServiceType } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { isoDay, todayUTC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Jobs({ searchParams }: { searchParams: Promise<{ week?: string; who?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const offset = Number(sp.week ?? 0);
  const t = todayUTC();
  const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 86400_000 + offset * 7 * 86400_000);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400_000));
  const staffView = user.role === "STAFF";
  const sb = admin();
  let jq = sb.from("Assignment").select("*, location:Location(name), user:User!Assignment_userId_fkey(name), serviceType:ServiceType(name)")
    .gte("date", isoDay(days[0])).lte("date", isoDay(days[6])).order("date").order("startTime");
  if (staffView) jq = jq.or(`userId.eq.${user.id},userId.is.null`);
  else if (sp.who === "open") jq = jq.is("userId", null);
  else if (sp.who) jq = jq.eq("userId", sp.who);
  const [jr, ur] = await Promise.all([jq, staffView ? null : sb.from("User").select("id, name").eq("active", true).order("name")]);
  const jobs = must(jr, "jobs") as (Assignment & { location: Pick<Location, "name">; user: Pick<Profile, "name"> | null; serviceType: Pick<ServiceType, "name"> | null })[];
  const staff = ur ? (must(ur, "team") as Pick<Profile, "id" | "name">[]) : [];
  const q = (o: Record<string, string | number | undefined>) => "?" + new URLSearchParams(Object.entries({ week: offset, who: sp.who, ...o }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

  return (
    <>
      <PageHeader title={staffView ? "My jobs" : "Schedule"} subtitle={`Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
        action={!staffView && <Link href="/jobs/new" className="btn-primary">New job</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={q({ week: offset - 1 })} className="btn-secondary">← Prev</Link>
        <Link href={q({ week: 0 })} className="btn-secondary">This week</Link>
        <Link href={q({ week: offset + 1 })} className="btn-secondary">Next →</Link>
        {!staffView && (
          <div className="flex flex-wrap gap-1 text-sm">
            <Link href={q({ who: "" })} className={`chip ${!sp.who ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>Everyone</Link>
            <Link href={q({ who: "open" })} className={`chip ${sp.who === "open" ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>Open shifts</Link>
            {staff.map((s) => <Link key={s.id} href={q({ who: s.id })} className={`chip ${sp.who === s.id ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>{s.name.split(" ")[0]}</Link>)}
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayJobs = jobs.filter((j) => isoDay(j.date) === isoDay(d));
          const isToday = isoDay(d) === isoDay(t);
          return (
            <div key={d.toISOString()} className={`rounded-xl border p-2 ${isToday ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-surface"}`}>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                {d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" })}
                {!staffView && <Link href={`/jobs/new?date=${isoDay(d)}`} className="-m-2 flex h-10 w-10 items-center justify-center text-brand-600" title="Add job" aria-label="Add job"><Plus className="h-3.5 w-3.5" /></Link>}
              </div>
              <div className="space-y-1.5">
                {dayJobs.map((j) => {
                  const tk = j.tasks ?? [];
                  return (
                    <Link key={j.id} href={`/jobs/${j.id}`} className={`block rounded-lg border p-2 text-xs hover:border-brand-500 ${j.userId ? "border-slate-200 bg-surface" : "border-dashed border-amber-400 bg-surface"}`}>
                      <div className="font-semibold text-slate-900">{j.startTime} · {j.location.name}</div>
                      {j.serviceType && <div className="text-[11px] font-medium text-brand-600">{j.serviceType.name}</div>}
                      <div className="mt-0.5 flex items-center justify-between gap-1 text-slate-500">
                        <span className="truncate">{j.user?.name ?? "Open shift"}</span>
                        <Badge value={j.status} />
                      </div>
                      {tk.length > 0 && <div className="mt-1 h-1 rounded bg-slate-200"><div className="h-1 rounded bg-emerald-500" style={{ width: `${(tk.filter((x) => x.done).length / tk.length) * 100}%` }} /></div>}
                    </Link>
                  );
                })}
                {dayJobs.length === 0 && <div className="py-2 text-center text-[11px] text-slate-400">—</div>}
              </div>
            </div>
          );
        })}
      </div>
      {jobs.length === 0 && <div className="mt-4"><Empty>No jobs this week.</Empty></div>}
    </>
  );
}
