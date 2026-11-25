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
import { qualityByKey, type QualityRow, type RoomResult } from "@/lib/quality";

function QualityTable({ title, rows, nameOf }: { title: string; rows: QualityRow[]; nameOf: (id: string) => string }) {
  return (
    <div className="card overflow-x-auto p-0">
      <div className="eyebrow px-3 pt-3">{title}</div>
      <table className="tbl">
        <thead><tr><th>Name</th><th className="text-right">Score</th><th className="text-right">Pass</th><th className="hidden text-right sm:table-cell">Rooms</th><th className="text-right">Rating</th></tr></thead>
        <tbody>
          {[...rows].sort((a, b) => (a.score ?? 101) - (b.score ?? 101)).map((r) => (
            <tr key={r.key}>
              <td className="font-medium">{nameOf(r.key)}{r.fails ? <span className="block text-xs text-red-600 sm:hidden">{r.fails} failed room{r.fails === 1 ? "" : "s"}</span> : null}</td>
              <td className={`text-right font-semibold ${r.score != null && r.score < 80 ? "text-red-600" : ""}`}>{r.score ?? "—"}</td>
              <td className="text-right">{r.passRate != null ? `${Math.round(r.passRate * 100)}%` : "—"}</td>
              <td className="hidden text-right sm:table-cell">{r.rooms}{r.fails ? <span className="text-xs text-red-600"> ({r.fails} fail)</span> : null}</td>
              <td className="text-right">{r.avgRating != null ? `${r.avgRating} (${r.ratings})` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
    const price = j.noCharge ? 0 : rate(j.location.clientId, j.serviceTypeId) ?? 0;
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
  // Quality: finished inspections' rooms and client ratings in the window, by cleaner and by location.
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [qRooms, qRatings, people] = await Promise.all([
    sb.from("InspectionRoom").select("result, inspection:Inspection!inner(cleanerId, locationId, completedAt)").not("inspection.completedAt", "is", null).gte("inspection.completedAt", since)
      .then((r) => must(r, "inspections") as unknown as { result: RoomResult; inspection: { cleanerId: string | null; locationId: string } }[]),
    sb.from("VisitFeedback").select("rating, cleanerId, locationId").gte("updatedAt", since).then((r) => must(r, "ratings") as { rating: number; cleanerId: string | null; locationId: string }[]),
    sb.from("User").select("id, name").then((r) => must(r, "team") as { id: string; name: string }[]),
  ]);
  const byCleaner = qualityByKey(qRooms.map((x) => ({ key: x.inspection.cleanerId, result: x.result })), qRatings.map((x) => ({ key: x.cleanerId, rating: x.rating })));
  const byLocation = qualityByKey(qRooms.map((x) => ({ key: x.inspection.locationId, result: x.result })), qRatings.map((x) => ({ key: x.locationId, rating: x.rating })));
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? locations.find((l) => l.id === id)?.name ?? "Inactive location";
  const allQ = qualityByKey(qRooms.map((x) => ({ key: "all", result: x.result })), qRatings.map((x) => ({ key: "all", rating: x.rating }))).get("all");

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
          <h2 className="h2 mb-2">Quality</h2>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Quality score" value={allQ?.score ?? "—"} hint="out of 100" />
            <Stat label="Passed first time" value={allQ?.passRate != null ? `${Math.round(allQ.passRate * 100)}%` : "—"} hint={`${allQ?.rooms ?? 0} rooms inspected`} tone={allQ?.passRate != null && allQ.passRate < 0.9 ? "amber" : "slate"} />
            <Stat label="Client rating" value={allQ?.avgRating != null ? `${allQ.avgRating}/5` : "—"} hint={`${allQ?.ratings ?? 0} ratings`} />
            <Stat label="Failed rooms" value={allQ ? allQ.fails : 0} hint="in inspections" tone={allQ?.fails ? "red" : "slate"} />
          </div>
          {byCleaner.size || byLocation.size ? (
            <div className="mb-6 grid gap-3 lg:grid-cols-2">
              <QualityTable title="By cleaner" rows={[...byCleaner.values()]} nameOf={nameOf} />
              <QualityTable title="By location" rows={[...byLocation.values()]} nameOf={nameOf} />
            </div>
          ) : <div className="mb-6"><Empty>No inspections or client ratings in this period yet. Inspect a finished job from its page, or turn on visit reports for a client.</Empty></div>}
          <p className="muted mb-2">Quality score: every inspected room (pass 100, touch-up 60, fail 0) and every client rating (5 stars = 100, 1 star = 0) counts once.</p>

          <h2 className="h2 mb-2 mt-6">By location</h2>
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
