import { KeyRound, MapPin, Package } from "lucide-react";
import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Assignment, Checkin, Location, Profile, StockLevel, Supply, SupplyDepot, TimeEntry } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { GeoForm } from "@/components/GeoForm";
import { Empty, FenceBadge, PageHeader, Badge } from "@/components/ui";
import { supplyPickup, siteCheckIn, siteCheckOut } from "@/app/actions/field";
import { fmtDateTime, fmtTime, today } from "@/lib/format";
import { DepotPicker } from "./DepotPicker";
import { ShiftCard } from "@/components/ShiftCard";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ mode?: string; done?: string; fence?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mode = sp.mode === "pickup" ? "pickup" : "site";
  const sb = admin();
  let jq = sb.from("Assignment").select("*, location:Location(*), user:User!Assignment_userId_fkey(name)")
    .gte("date", today(-1)).lte("date", today()).in("status", ["SCHEDULED", "IN_PROGRESS"]).order("date", { ascending: false }).order("startTime");
  if (user.role === "STAFF") jq = jq.eq("userId", user.id);
  const [ar, jr, dr, sr, rr] = await Promise.all([
    sb.from("TimeEntry").select("*, assignment:Assignment(*, location:Location(*))").eq("userId", user.id).is("clockOut", null).limit(1).maybeSingle(),
    jq,
    sb.from("SupplyDepot").select("*, stock:StockLevel(*)").order("name"),
    sb.from("Supply").select("*").order("name"),
    sb.from("Checkin").select("*, location:Location(name), depot:SupplyDepot(name)").eq("userId", user.id).order("at", { ascending: false }).limit(8),
  ]);
  const active = must(ar, "clock") as (TimeEntry & { assignment: (Assignment & { location: Location }) | null }) | null;
  const jobs = must(jr, "jobs") as (Assignment & { location: Location; user: Pick<Profile, "name"> | null })[];
  const depots = must(dr, "pickup locations") as (SupplyDepot & { stock: StockLevel[] })[];
  const supplies = must(sr, "supplies") as Supply[];
  const recent = must(rr, "check-ins") as (Checkin & { location: Pick<Location, "name"> | null; depot: Pick<SupplyDepot, "name"> | null })[];

  return (
    <>
      <PageHeader title="Check in" subtitle="Your location is recorded with each check-in." />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      <div className="mb-5"><ShiftCard userId={user.id} back="/checkin" /></div>
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
              <GeoForm action={siteCheckOut} submitLabel="Check out" className="btn-danger w-full" offline="checkOut">
                <input type="hidden" name="assignmentId" value={active.assignmentId!} />
              </GeoForm>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-surface p-1 text-sm font-semibold sm:inline-grid sm:w-auto">
        <Link href="/checkin?mode=site" className={`flex min-h-11 items-center justify-center rounded-md px-4 ${mode === "site" ? "bg-ink text-paper" : "text-slate-600"}`}><MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Arrive at site</Link>
        <Link href="/checkin?mode=pickup" className={`flex min-h-11 items-center justify-center rounded-md px-4 ${mode === "pickup" ? "bg-ink text-paper" : "text-slate-600"}`}><Package className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Supply pickup</Link>
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
              {j.location.accessNotes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600"><KeyRound className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{j.location.accessNotes}</p>}
              <div className="mt-3">
                <GeoForm action={siteCheckIn} submitLabel="Check in here" offline="checkIn">
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
