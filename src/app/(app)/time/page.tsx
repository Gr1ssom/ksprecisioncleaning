import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { editTime } from "@/app/actions/manage";
import { APP_TZ, fmtDate, fmtTime, hoursBetween, todayUTC } from "@/lib/format";
import { ApproveButton } from "./ApproveButton";

export const dynamic = "force-dynamic";

// datetime-local value in business timezone
const local = (d: Date | null) => {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};

export default async function TimePage({ searchParams }: { searchParams: Promise<{ days?: string; who?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = Number(sp.days ?? 14);
  const mgr = user.role !== "STAFF";
  const entries = await db.timeEntry.findMany({
    where: { clockIn: { gte: todayUTC(-days) }, ...(mgr ? (sp.who ? { userId: sp.who } : {}) : { userId: user.id }) },
    include: { user: true, assignment: { include: { location: true } } }, orderBy: { clockIn: "desc" },
  });
  const total = entries.reduce((s, e) => s + hoursBetween(e.clockIn, e.clockOut), 0);
  const pending = entries.filter((e) => !e.approved && e.clockOut);
  const staff = mgr ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];

  return (
    <>
      <PageHeader title={mgr ? "Time entries" : "My hours"} subtitle={`Last ${days} days`}
        action={mgr && pending.length > 0 && <ApproveButton ids={pending.map((e) => e.id)} label={`Approve all ${pending.length}`} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Hours" value={total.toFixed(2)} />
        <Stat label="Entries" value={entries.length} />
        <Stat label="Awaiting approval" value={pending.length} tone={pending.length ? "amber" : "slate"} />
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="days" defaultValue={String(days)} className="input w-36"><option value="7">7 days</option><option value="14">14 days</option><option value="31">31 days</option><option value="90">90 days</option></select>
        {mgr && <select name="who" defaultValue={sp.who ?? ""} className="input w-44"><option value="">Everyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <button className="btn-secondary">Filter</button>
      </form>
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
