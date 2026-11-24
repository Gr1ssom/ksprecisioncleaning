import { admin, must } from "@/lib/supabase/server";
import type { Assignment, Break, Location, Profile, Shift, TimeEntry } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { editShift, editTime } from "@/app/actions/manage";
import { getRules } from "@/lib/settings";
import { hoursOf, paidSpans } from "@/lib/worktime";
import { APP_TZ, fmtDate, fmtTime, hoursBetween, todayUTC } from "@/lib/format";
import { ApproveButton } from "./ApproveButton";

export const dynamic = "force-dynamic";

// datetime-local value in business timezone
const local = (iso: string | null) => {
  const d = iso ? new Date(iso) : null;
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};

export default async function TimePage({ searchParams }: { searchParams: Promise<{ days?: string; who?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = Number(sp.days ?? 14);
  const mgr = user.role !== "STAFF";
  const sb = admin();
  let eq = sb.from("TimeEntry").select("*, user:User!TimeEntry_userId_fkey(name), assignment:Assignment(location:Location(name))")
    .gte("clockIn", todayUTC(-days).toISOString()).order("clockIn", { ascending: false });
  if (!mgr) eq = eq.eq("userId", user.id); else if (sp.who) eq = eq.eq("userId", sp.who);
  let sq = sb.from("Shift").select("*, user:User!Shift_userId_fkey(name)").gte("clockIn", todayUTC(-days).toISOString()).order("clockIn", { ascending: false });
  let bq = sb.from("Break").select("*").gte("startedAt", todayUTC(-days - 1).toISOString());
  if (!mgr) { sq = sq.eq("userId", user.id); bq = bq.eq("userId", user.id); } else if (sp.who) { sq = sq.eq("userId", sp.who); bq = bq.eq("userId", sp.who); }
  const [entries, shifts, breaks, rules] = await Promise.all([
    eq.then((r) => must(r, "time entries") as (TimeEntry & { user: Pick<Profile, "name">; assignment: (Pick<Assignment, "id"> & { location: Pick<Location, "name"> }) | null })[]),
    sq.then((r) => must(r, "days") as (Shift & { user: Pick<Profile, "name"> })[]),
    bq.then((r) => must(r, "breaks") as Break[]),
    getRules(),
  ]);
  // Paid hours follow the owner's rules (whole day or job time only; breaks paid or not).
  const now = Date.now();
  const people = [...new Set([...entries.map((e) => e.userId), ...shifts.map((x) => x.userId)])];
  const total = people.reduce((sum, id) => sum + hoursOf(paidSpans({
    shifts: shifts.filter((x) => x.userId === id), jobs: entries.filter((e) => e.userId === id), breaks: breaks.filter((b) => b.userId === id),
  }, rules, { now })), 0);
  const dayPaid = (sh: Shift) => hoursOf(paidSpans({ shifts: [sh], jobs: [], breaks: breaks.filter((b) => b.shiftId === sh.id) }, { paidDriveTime: true, paidBreaks: rules.paidBreaks }, { now }));
  const breakMin = (sh: Shift) => Math.round(breaks.filter((b) => b.shiftId === sh.id).reduce((m, b) => m + hoursBetween(b.startedAt, b.endedAt ?? new Date()) * 60, 0));
  const pending = entries.filter((e) => !e.approved && e.clockOut);
  const pendingDays = shifts.filter((x) => !x.approved && x.clockOut);
  const staff = mgr ? (must(await sb.from("User").select("id, name").eq("active", true).order("name"), "team") as Pick<Profile, "id" | "name">[]) : [];

  return (
    <>
      <PageHeader title={mgr ? "Time entries" : "My hours"} subtitle={`Last ${days} days`}
        action={mgr && pending.length + pendingDays.length > 0 && <ApproveButton ids={pending.map((e) => e.id)} shiftIds={pendingDays.map((x) => x.id)} label={`Approve all ${pending.length + pendingDays.length}`} />} />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Paid hours" value={total.toFixed(2)} hint={rules.paidDriveTime ? "whole days" : "job time only"} />
        <Stat label="Days" value={shifts.length} hint={`${entries.length} jobs`} />
        <Stat label="Awaiting approval" value={pending.length + pendingDays.length} tone={pending.length + pendingDays.length ? "amber" : "slate"} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="days" defaultValue={String(days)} className="input w-36"><option value="7">7 days</option><option value="14">14 days</option><option value="31">31 days</option><option value="90">90 days</option></select>
        {mgr && <select name="who" defaultValue={sp.who ?? ""} className="input w-44"><option value="">Everyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <button className="btn-secondary">Filter</button>
      </form>
      <h2 className="h2 mb-2">Days</h2>
      <p className="muted mb-2">From start of day (or first pickup or check-in) to end of day.{rules.paidDriveTime ? " Drive time and supply runs between jobs are paid." : " Only time at jobs is paid."}{rules.paidBreaks ? " Breaks are paid." : " Breaks are unpaid."}</p>
      {shifts.length === 0 ? <div className="mb-6"><Empty>No days on the clock yet.</Empty></div> : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr>{mgr && <th>Who</th>}<th>Date</th><th>Start</th><th>End</th><th className="text-right">Breaks</th><th className="text-right">Hours</th><th></th></tr></thead>
            <tbody>
              {shifts.map((x) => (
                <tr key={x.id}>
                  {mgr && <td className="font-medium">{x.user.name}</td>}
                  <td>{fmtDate(x.clockIn)}</td>
                  <td>{fmtTime(x.clockIn)}</td>
                  <td>{x.clockOut ? fmtTime(x.clockOut) : <span className="badge bg-emerald-100 text-emerald-700">on the clock</span>}</td>
                  <td className="text-right tabular-nums">{breakMin(x) ? `${breakMin(x)} min` : "—"}</td>
                  <td className="text-right tabular-nums">{dayPaid(x).toFixed(2)}</td>
                  <td className="whitespace-nowrap text-right">
                    {x.approved ? <span className="badge bg-emerald-100 text-emerald-700">approved</span> : mgr && x.clockOut ? <ApproveButton ids={[]} shiftIds={[x.id]} label="Approve" small /> : <span className="badge bg-amber-100 text-amber-700">pending</span>}
                    {mgr && (
                      <details className="mt-1 text-left">
                        <summary className="cursor-pointer text-xs text-brand-600">Edit</summary>
                        <form action={editShift} className="mt-2 w-60 space-y-2">
                          <input type="hidden" name="id" value={x.id} />
                          <input type="datetime-local" name="clockIn" defaultValue={local(x.clockIn)} className="input" aria-label="Start" />
                          <input type="datetime-local" name="clockOut" defaultValue={local(x.clockOut)} className="input" aria-label="End" />
                          <input name="note" defaultValue={x.note ?? ""} placeholder="Reason for change" className="input" />
                          <button className="btn-secondary text-xs">Save</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="h2 mb-2">Time at jobs</h2>
      {entries.length === 0 ? <Empty>No time entries.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr>{mgr && <th>Who</th>}<th>Date</th><th>Location</th><th>In</th><th>Out</th><th className="text-right">Hours</th><th></th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  {mgr && <td className="font-medium">{e.user.name}</td>}
                  <td>{fmtDate(e.clockIn)}</td>
                  <td>{e.assignment?.location.name ?? "—"}</td>
                  <td>{fmtTime(e.clockIn)}</td>
                  <td>{e.clockOut ? fmtTime(e.clockOut) : <span className="badge bg-emerald-100 text-emerald-700">on the clock</span>}</td>
                  <td className="text-right tabular-nums">{hoursBetween(e.clockIn, e.clockOut).toFixed(2)}</td>
                  <td className="whitespace-nowrap text-right">
                    {e.approved ? <span className="badge bg-emerald-100 text-emerald-700">approved</span> : mgr && e.clockOut ? <ApproveButton ids={[e.id]} label="Approve" small /> : <span className="badge bg-amber-100 text-amber-700">pending</span>}
                    {mgr && (
                      <details className="mt-1 text-left">
                        <summary className="cursor-pointer text-xs text-brand-600">Edit</summary>
                        <form action={editTime} className="mt-2 w-60 space-y-2">
                          <input type="hidden" name="id" value={e.id} />
                          <input type="datetime-local" name="clockIn" defaultValue={local(e.clockIn)} className="input" />
                          <input type="datetime-local" name="clockOut" defaultValue={local(e.clockOut)} className="input" />
                          <input name="note" defaultValue={e.note ?? ""} placeholder="Reason for change" className="input" />
                          <button className="btn-secondary text-xs">Save</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
