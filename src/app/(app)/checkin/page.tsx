import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { GeoForm } from "@/components/GeoForm";
import { Empty, FenceBadge, PageHeader, Badge } from "@/components/ui";
import { supplyPickup, siteCheckIn, siteCheckOut } from "@/app/actions/field";
import { fmtDateTime, fmtTime, todayUTC } from "@/lib/format";
import { DepotPicker } from "./DepotPicker";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ mode?: string; done?: string; fence?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mode = sp.mode === "pickup" ? "pickup" : "site";
  const [active, jobs, depots, supplies, recent] = await Promise.all([
    db.timeEntry.findFirst({ where: { userId: user.id, clockOut: null }, include: { assignment: { include: { location: true } } } }),
    db.assignment.findMany({
      where: { date: { gte: todayUTC(-1), lte: todayUTC() }, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(user.role === "STAFF" ? { userId: user.id } : {}) },
      include: { location: true, user: true }, orderBy: [{ date: "desc" }, { startTime: "asc" }],
    }),
    db.supplyDepot.findMany({ include: { stock: true }, orderBy: { name: "asc" } }),
    db.supply.findMany({ orderBy: { name: "asc" } }),
    db.checkin.findMany({ where: { userId: user.id }, include: { location: true, depot: true }, orderBy: { at: "desc" }, take: 8 }),
  ]);

  return (
    <>
      <PageHeader title="Check in" subtitle="Your location is recorded with each check-in." />
      {sp.done === "pickup" && (
        <div className={`mb-4 rounded-xl p-3 text-sm ${sp.fence === "false" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
          {sp.fence === "false" ? "Pickup saved, but you look far from the depot. Your manager will see a flag." : "Pickup saved and inventory updated. ✓"}
        </div>
      )}

      {active?.assignment && (
        <div className="card mb-5 border-emerald-300">
          <div className="text-xs font-semibold uppercase text-emerald-600">Checked in since {fmtTime(active.clockIn)}</div>
          <div className="mb-3 text-lg font-bold">{active.assignment.location.name}</div>
          <div className="flex gap-2">
            <Link href={`/jobs/${active.assignmentId}`} className="btn-secondary flex-1">Open job</Link>
            <div className="flex-1">
              <GeoForm action={siteCheckOut} submitLabel="Check out" className="btn-danger w-full">
                <input type="hidden" name="assignmentId" value={active.assignmentId!} />
              </GeoForm>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-surface p-1 text-sm">
        <Link href="/checkin?mode=site" className={`rounded-md px-4 py-1.5 ${mode === "site" ? "bg-brand-600 text-white" : "text-slate-600"}`}>📍 Arrive at site</Link>
        <Link href="/checkin?mode=pickup" className={`rounded-md px-4 py-1.5 ${mode === "pickup" ? "bg-brand-600 text-white" : "text-slate-600"}`}>📦 Supply pickup</Link>
      </div>

      {mode === "site" ? (
        <div className="space-y-3">
          {jobs.length === 0 && <Empty>No jobs for you today. Ask your manager to assign one.</Empty>}
          {jobs.filter((j) => j.id !== active?.assignmentId).map((j) => (
            <div key={j.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{j.location.name}</div>
                  <div className="text-xs text-slate-500">{j.location.address} · {j.startTime}{user.role !== "STAFF" && ` · ${j.user?.name ?? "Unassigned"}`}</div>
                </div>
                <Badge value={j.status} />
              </div>
              {j.location.accessNotes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">🔑 {j.location.accessNotes}</p>}
              <div className="mt-3">
                <GeoForm action={siteCheckIn} submitLabel="Check in here">
                  <input type="hidden" name="assignmentId" value={j.id} />
                  <input name="note" className="input" placeholder="Note (optional)" />
                </GeoForm>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <GeoForm action={supplyPickup} submitLabel="Check in and record pickup">
            <DepotPicker
              depots={depots.map((d) => ({ id: d.id, name: d.name, address: d.address, stock: Object.fromEntries(d.stock.map((s) => [s.supplyId, s.quantity])) }))}
              supplies={supplies.map((s) => ({ id: s.id, name: s.name, unit: s.unit }))}
            />
            <input name="note" className="input" placeholder="Note (optional) – e.g. which job these are for" />
          </GeoForm>
        </div>
      )}

      <h2 className="h2 mb-2 mt-8">My recent check-ins</h2>
      <div className="card divide-y divide-slate-100 p-0">
        {recent.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
            <div><Badge value={c.type} label={{ SUPPLY_PICKUP: "pickup", SITE_IN: "in", SITE_OUT: "out" }[c.type]} /> {c.location?.name ?? c.depot?.name}<div className="text-xs text-slate-500">{fmtDateTime(c.at)}</div></div>
            <FenceBadge within={c.withinFence} distance={c.distanceM} />
          </div>
        ))}
        {recent.length === 0 && <div className="p-4 text-sm text-slate-500">No check-ins yet.</div>}
      </div>
    </>
  );
}
