import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { AppError, AuditEntry, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const AREAS: [string, string][] = [["", "Everything"], ["TimeEntry", "Hours"], ["User", "Team"], ["Client", "Prices"], ["Invoice", "Invoices"], ["Supply", "Stock"], ["Location", "Locations"], ["Sop", "SOPs"], ["Assignment", "Jobs"], ["ServiceType", "Services"]];

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
  : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? fmtDateTime(v)
  : typeof v === "object" ? JSON.stringify(v) : String(v);

export default async function Activity({ searchParams }: { searchParams: Promise<{ tab?: string; area?: string }> }) {
  await requireUser("OWNER");
  const sp = await searchParams;
  const tab = sp.tab === "errors" ? "errors" : "changes";
  const sb = admin();
  let q = sb.from("AuditLog").select("*, actor:User(name)").order("at", { ascending: false }).limit(200);
  if (sp.area) q = q.eq("entity", sp.area);
  const [entries, errors] = await Promise.all([
    tab === "changes" ? q.then((r) => must(r, "activity") as (AuditEntry & { actor: Pick<Profile, "name"> | null })[]) : Promise.resolve([]),
    tab === "errors" ? sb.from("AppError").select("*").order("at", { ascending: false }).limit(100).then((r) => must(r, "errors") as AppError[]) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Activity" subtitle="Who changed what, and any errors the app hit. Only the owner sees this." />
      <div className="mb-3 grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-surface p-1 text-sm font-semibold sm:inline-grid sm:w-auto">
        <Link href="/activity" className={`flex min-h-11 items-center justify-center rounded-md px-4 ${tab === "changes" ? "bg-ink text-paper" : "text-slate-600"}`}>Changes</Link>
        <Link href="/activity?tab=errors" className={`flex min-h-11 items-center justify-center rounded-md px-4 ${tab === "errors" ? "bg-ink text-paper" : "text-slate-600"}`}>Errors</Link>
      </div>

      {tab === "changes" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {AREAS.map(([v, l]) => (
              <Link key={v} href={v ? `/activity?area=${v}` : "/activity"} className={`chip ${(sp.area ?? "") === v ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>{l}</Link>
            ))}
          </div>
          {entries.length === 0 ? <Empty>No changes recorded yet.</Empty> : (
            <ol className="card divide-y divide-slate-100 p-0">
              {entries.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{e.summary}</span>
                    <span className="text-xs text-slate-500">{fmtDateTime(e.at)}</span>
                  </div>
                  <div className="text-xs text-slate-500">{e.actor?.name ?? "Someone no longer on the team"} · {e.action}</div>
                  {e.after && e.before && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {Object.keys(e.after).map((k) => <li key={k}><span className="text-slate-500">{k}:</span> {show(e.before?.[k])} → {show(e.after?.[k])}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : errors.length === 0 ? <Empty>No errors recorded. The app is running cleanly.</Empty> : (
        <ol className="card divide-y divide-slate-100 p-0">
          {errors.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-red-700">{e.message}</span>
                <span className="text-xs text-slate-500">{fmtDateTime(e.at)}</span>
              </div>
              <div className="text-xs text-slate-500">{e.method} {e.path}{e.kind && ` · ${e.kind}`}{e.digest && ` · ref ${e.digest}`}</div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
