import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { cancelTimeOff, requestTimeOff, saveAvailability } from "@/app/actions/requests";
import { fmtDate, today } from "@/lib/format";
import type { AvailabilityRow, TimeOff } from "@/lib/types";

export const dynamic = "force-dynamic";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TimeOffPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; saved?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const sb = admin();
  const [tr, ar] = await Promise.all([
    sb.from("TimeOff").select("*").eq("userId", me.id).gte("endDate", today(-60)).order("startDate", { ascending: false }),
    sb.from("Availability").select("*").eq("userId", me.id),
  ]);
  const requests = must(tr, "time off") as TimeOff[];
  const avail = must(ar, "availability") as AvailabilityRow[];
  const day = (d: number) => avail.find((a) => a.weekday === d);

  return (
    <>
      <PageHeader title="Time off" subtitle="Ask for days off and tell your manager when you can work." />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {sp.sent && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Request sent. You&apos;ll get a notification when it&apos;s decided.</div>}
      {sp.saved && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Availability saved.</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="h2 mb-2">Ask for time off</h2>
          <form action={requestTimeOff} className="card space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="startDate">First day off</label><input id="startDate" name="startDate" type="date" min={today()} className="input" required /></div>
              <div><label className="label" htmlFor="endDate">Last day off</label><input id="endDate" name="endDate" type="date" min={today()} className="input" /></div>
            </div>
            <div><label className="label" htmlFor="reason">Reason (optional)</label><input id="reason" name="reason" className="input" placeholder="e.g. Family trip" /></div>
            <button className="btn-primary">Send request</button>
          </form>

          <h2 className="h2 mb-2 mt-6">My requests</h2>
          {requests.length === 0 ? <Empty>No requests yet.</Empty> : (
            <div className="card divide-y divide-slate-100 p-0">
              {requests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <div className="font-medium">{r.startDate === r.endDate ? fmtDate(r.startDate) : `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`}</div>
                    {r.reason && <div className="text-xs text-slate-500">{r.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge value={r.status} />
                    {(r.status === "PENDING" || (r.status === "APPROVED" && r.startDate > today())) && (
                      <form action={cancelTimeOff.bind(null, r.id)}><button className="btn-secondary">Cancel</button></form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="h2 mb-2">When I can work</h2>
          <form action={saveAvailability} className="card space-y-1">
            <p className="muted mb-2">Your manager sees a warning when a job falls outside these hours.</p>
            {DAYS.map((name, d) => {
              const a = day(d);
              const mode = !a ? "any" : a.available ? "hours" : "off";
              return (
                <fieldset key={d} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 border-t border-slate-100 py-2 first:border-t-0">
                  <legend className="sr-only">{name}</legend>
                  <span className="text-sm font-semibold">{name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select name={`mode_${d}`} defaultValue={mode} className="input w-36" aria-label={`${name} availability`}>
                      <option value="any">Any time</option>
                      <option value="hours">These hours</option>
                      <option value="off">Not available</option>
                    </select>
                    <input type="time" name={`start_${d}`} defaultValue={a?.startTime ?? ""} className="input w-32" aria-label={`${name} from`} />
                    <input type="time" name={`end_${d}`} defaultValue={a?.endTime ?? ""} className="input w-32" aria-label={`${name} until`} />
                  </div>
                </fieldset>
              );
            })}
            <button className="btn-primary mt-2">Save</button>
          </form>
        </section>
      </div>
    </>
  );
}
