import { admin, must } from "@/lib/supabase/server";
import { layoutsWithTasks } from "@/lib/rooms";
import { RoomHeatmap } from "@/components/RoomHeatmap";
import type { Assignment, Client, Location, Profile, ServiceType, TimeEntry } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { RoomTimeTable } from "@/components/RoomTimeTable";
import { roomTimeReport } from "@/lib/reports";
import { APP_TZ, hoursBetween, money, today } from "@/lib/format";
import { PrintButton } from "./PrintButton";
import { rateBook } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: { searchParams: Promise<{ locationId?: string; days?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);
  const sb = admin();
  const locations = must(await sb.from("Location").select("*, client:Client(name)").eq("active", true).order("name"), "locations") as (Location & { client: Pick<Client, "name"> | null })[];
  const loc = locations.find((l) => l.id === sp.locationId);

  // Company-wide: profitability per location
  type TE = TimeEntry & { user: Pick<Profile, "hourlyRate"> };
  const jobs = (must(await sb.from("Assignment")
    .select("*, location:Location(*), serviceType:ServiceType(name), timeEntry:TimeEntry(*, user:User!TimeEntry_userId_fkey(hourlyRate))")
    .gte("date", today(-days)).eq("status", "COMPLETED"), "jobs") as (Assignment & { location: Location; serviceType: Pick<ServiceType, "name"> | null; timeEntry: TE | TE[] | null })[])
    .map((j) => ({ ...j, timeEntry: Array.isArray(j.timeEntry) ? j.timeEntry[0] ?? null : j.timeEntry }));
  const rate = await rateBook();
  const bySvc = new Map<string, { visits: number; revenue: number; hours: number }>();
  const per = new Map<string, { name: string; visits: number; revenue: number; hours: number; labor: number }>();
  let onTime = 0, timed = 0;
  for (const j of jobs) {
    const e = per.get(j.locationId) ?? { name: j.location.name, visits: 0, revenue: 0, hours: 0, labor: 0 };
    const price = rate(j.location.clientId, j.serviceTypeId) ?? 0;
    e.visits++; e.revenue += price;
    const sv = bySvc.get(j.serviceType?.name ?? "No service type") ?? { visits: 0, revenue: 0, hours: 0 };
    sv.visits++; sv.revenue += price;
    if (j.timeEntry) sv.hours += hoursBetween(j.timeEntry.clockIn, j.timeEntry.clockOut);
    bySvc.set(j.serviceType?.name ?? "No service type", sv);
    if (j.timeEntry) {
      const h = hoursBetween(j.timeEntry.clockIn, j.timeEntry.clockOut);
      e.hours += h; e.labor += h * Number(j.timeEntry.user.hourlyRate);
      const [hh, mm] = j.startTime.split(":").map(Number);
      const local = new Date(new Date(j.timeEntry.clockIn).toLocaleString("en-US", { timeZone: APP_TZ }));
      timed++; if (local.getHours() * 60 + local.getMinutes() <= hh * 60 + mm + 10) onTime++;
    }
    per.set(j.locationId, e);
  }
  const rows = [...per.values()].sort((a, b) => b.revenue - a.revenue);
  const missed = (await sb.from("Assignment").select("id", { count: "exact", head: true }).gte("date", today(-days)).eq("status", "MISSED")).count ?? 0;
  const [report, plans] = loc ? await Promise.all([roomTimeReport(loc.id, days), layoutsWithTasks(loc.id)]) : [null, []];

  return (
    <>
      <PageHeader title="Reports" subtitle={`Last ${days} days`} action={loc && <PrintButton />} />
      <form className="mb-5 flex flex-wrap gap-2 print:hidden">
        <select name="locationId" defaultValue={sp.locationId ?? ""} className="input w-64"><option value="">All locations (overview)</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <select name="days" defaultValue={String(days)} className="input w-36"><option value="30">30 days</option><option value="90">90 days</option><option value="365">12 months</option></select>
        <button className="btn-secondary">Show</button>
      </form>

      {loc && report ? (
        <section>
          <div className="mb-3">
            <h2 className="h2">Time by room – {loc.name}</h2>
            <p className="muted">Prepared for {loc.client?.name ?? "client"}. Share or print this to show where cleaning time is spent.</p>
          </div>
          {report.rooms.length > 0 && plans.some((p) => p.rooms.length) && (
            <div className="mb-4">
              <RoomHeatmap layouts={plans.filter((p) => p.rooms.length).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, aspect: p.aspect, rooms: p.rooms.map((r) => ({ id: r.id, name: r.name, points: r.points, color: r.color })) }))}
                minutes={Object.fromEntries(report.rooms.map((r) => [r.roomId, r.avgMin]))} />
            </div>
          )}
          {report.rooms.length ? <RoomTimeTable report={report} /> : <Empty>No room timers recorded here yet. Staff start them from the job&apos;s room map.</Empty>}
        </section>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Completed visits" value={jobs.length} />
            <Stat label="Missed" value={missed} tone={missed ? "red" : "slate"} />
            <Stat label="On-time arrival" value={timed ? `${Math.round((onTime / timed) * 100)}%` : "—"} hint="within 10 min of start" />
            <Stat label="Gross margin" value={(() => { const r = rows.reduce((s, x) => s + x.revenue, 0); const l = rows.reduce((s, x) => s + x.labor, 0); return r ? `${Math.round(((r - l) / r) * 100)}%` : "—"; })()} hint="revenue less labor" />
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Location</th><th className="text-right">Visits</th><th className="text-right">Revenue</th><th className="text-right">Hours</th><th className="text-right">Labor</th><th className="text-right">Margin</th><th className="text-right">$/hour</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="font-medium">{r.name}</td><td className="text-right">{r.visits}</td><td className="text-right">{money(r.revenue)}</td>
                    <td className="text-right">{r.hours.toFixed(1)}</td><td className="text-right">{money(r.labor)}</td>
                    <td className={`text-right font-semibold ${r.revenue - r.labor < 0 ? "text-red-600" : "text-emerald-600"}`}>{money(r.revenue - r.labor)}</td>
                    <td className="text-right">{r.hours ? money(r.revenue / r.hours) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="h2 mb-2 mt-6">By service</h2>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Service</th><th className="text-right">Visits</th><th className="text-right">Revenue</th><th className="text-right">Avg price</th><th className="text-right">Avg hours</th><th className="text-right">$/hour</th></tr></thead>
              <tbody>
                {[...bySvc.entries()].map(([name, v]) => (
                  <tr key={name}>
                    <td className="font-medium">{name}</td><td className="text-right">{v.visits}</td><td className="text-right">{money(v.revenue)}</td>
                    <td className="text-right">{money(v.revenue / v.visits)}</td><td className="text-right">{(v.hours / v.visits).toFixed(1)}</td>
                    <td className="text-right">{v.hours ? money(v.revenue / v.hours) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-2">Pick a location above to see its time-by-room report for the client.</p>
        </>
      )}
    </>
  );
}
