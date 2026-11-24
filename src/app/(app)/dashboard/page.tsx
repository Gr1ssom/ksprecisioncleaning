import { CalendarClock, Clock, MapPin, Megaphone, Package, TriangleAlert } from "lucide-react";
import { ShiftCard } from "@/components/ShiftCard";
import { weekHours, weekOf } from "@/lib/work";
import { getRules } from "@/lib/settings";
import { payrollFor } from "@/lib/payroll";
import { jobHours } from "@/lib/worktime";
import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Announcement, Assignment, Checkin, Invoice, Location, Profile, Shift, StockLevel, Supply, SupplyDepot, TimeEntry } from "@/lib/types";
import { postAnnouncement } from "@/app/actions/manage";
import { rateBook } from "@/lib/pricing";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, FenceBadge, PageHeader, Stat } from "@/components/ui";
import { APP_TZ, fmtDate, fmtDateTime, fmtTime, hoursBetween, money, today, todayUTC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const announcements = must(await admin().from("Announcement").select("*").order("createdAt", { ascending: false }).limit(2), "announcements") as Announcement[];
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: APP_TZ })} />
      {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {announcements.map((a) => (
        <div key={a.id} className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm">
          <div className="font-semibold text-slate-900"><Megaphone className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{a.title}</div>
          <div className="mt-1 text-slate-700">{a.body}</div>
        </div>
      ))}
      {user.role === "STAFF" ? <StaffDash userId={user.id} /> : <ManagerDash owner={user.role === "OWNER"} />}
    </>
  );
}

async function StaffDash({ userId }: { userId: string }) {
  const sb = admin();
  const J = "*, location:Location(name, address), serviceType:ServiceType(name)";
  const [r1, r2, r3, r4, r5] = await Promise.all([
    sb.from("Assignment").select(J).eq("userId", userId).eq("date", today()).neq("status", "CANCELLED").order("startTime"),
    sb.from("Assignment").select(J).eq("userId", userId).gt("date", today()).lte("date", today(7)).eq("status", "SCHEDULED").order("date").order("startTime"),
    sb.from("TimeEntry").select("*, assignment:Assignment(location:Location(name))").eq("userId", userId).is("clockOut", null).limit(1).maybeSingle(),
    weekHours([userId]),
    sb.from("Assignment").select(J).is("userId", null).gte("date", today()).eq("status", "SCHEDULED").order("date").limit(3),
  ]);
  const jobs = must(r1, "jobs") as JobRow[];
  const upcoming = must(r2, "upcoming") as JobRow[];
  const active = must(r3, "clock") as (TimeEntry & { assignment: { location: Pick<Location, "name"> } | null }) | null;

  const open = must(r5, "open shifts") as JobRow[];
  const hoursThisWeek = r4[userId] ?? 0;
  return (
    <div className="space-y-5">
      <ShiftCard userId={userId} back="/dashboard" />
      {active?.assignment ? (
        <Link href={`/jobs/${active.assignmentId}`} className="block rounded-xl bg-emerald-600 p-4 text-white shadow">
          <div className="text-xs font-semibold uppercase opacity-80">On the clock</div>
          <div className="text-lg font-bold">{active.assignment.location.name}</div>
          <div className="text-sm opacity-90">Since {fmtTime(active.clockIn)} · tap to open the room map</div>
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/checkin?mode=pickup" className="card text-center hover:border-brand-500"><Package className="mx-auto h-7 w-7" strokeWidth={1.5} /><div className="mt-2 text-sm font-semibold uppercase tracking-wider">Supply pickup</div></Link>
          <Link href="/checkin?mode=site" className="card text-center hover:border-brand-500"><MapPin className="mx-auto h-7 w-7" strokeWidth={1.5} /><div className="mt-2 text-sm font-semibold uppercase tracking-wider">Arrive at site</div></Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Jobs today" value={jobs.length} />
        <Stat label="Hours this week" value={hoursThisWeek.toFixed(1)} href="/time" />
        <Stat label="Next 7 days" value={upcoming.length} hint="scheduled jobs" />
      </div>
      <section>
        <h2 className="h2 mb-2">Today</h2>
        {jobs.length ? <JobList jobs={jobs} /> : <Empty>No jobs today. Enjoy the day off!</Empty>}
      </section>
      {upcoming.length > 0 && (
        <section>
          <h2 className="h2 mb-2">Coming up</h2>
          <JobList jobs={upcoming} showDate />
        </section>
      )}
      {open.length > 0 && (
        <section>
          <h2 className="h2 mb-2">Open shifts</h2>
          <p className="muted mb-2">Open one and tap &quot;Ask for this shift&quot;. Your manager approves it.</p>
          <JobList jobs={open} showDate />
        </section>
      )}
    </div>
  );
}

type JobRow = Assignment & { location: { name: string; address?: string }; user?: { name: string } | null; serviceType?: { name: string } | null };
function JobList({ jobs, showDate, showUser }: { jobs: JobRow[]; showDate?: boolean; showUser?: boolean }) {
  return (
    <div className="space-y-2">
      {jobs.map((j) => {
        const t = j.tasks ?? [];
        return (
          <Link key={j.id} href={`/jobs/${j.id}`} className="card flex items-center justify-between gap-3 hover:border-brand-500">
            <div className="min-w-0">
              <div className="truncate font-semibold">{j.location.name}</div>
              <div className="truncate text-xs text-slate-500">
                {j.serviceType && `${j.serviceType.name} · `}{showDate && `${fmtDate(j.date)} · `}{j.startTime}{j.endTime ? `–${j.endTime}` : ""}
                {showUser && ` · ${j.user?.name ?? "Unassigned"}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {t.length > 0 && <span className="text-xs text-slate-500">{t.filter((x) => x.done).length}/{t.length}</span>}
              <Badge value={j.status} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

async function ManagerDash({ owner }: { owner: boolean }) {
  const sb = admin();
  const monthStart = today().slice(0, 8) + "01";
  const wk = weekOf();
  const [r1, r2, r3, r4, r5, r6, r7, r8, r10, r11, r12, r13, r14] = await Promise.all([
    sb.from("Assignment").select("*, location:Location(name), user:User!Assignment_userId_fkey(name), serviceType:ServiceType(name)").eq("date", today()).neq("status", "CANCELLED").order("startTime"),
    sb.from("TimeEntry").select("*, user:User!TimeEntry_userId_fkey(name), assignment:Assignment(location:Location(name))").is("clockOut", null),
    sb.from("Checkin").select("*, user:User(name), location:Location(name), depot:SupplyDepot(name)").eq("withinFence", false).gte("at", todayUTC(-7).toISOString()).order("at", { ascending: false }).limit(5),
    sb.from("Issue").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
    sb.from("StockLevel").select("*, supply:Supply(name, reorderAt), depot:SupplyDepot(name)"),
    sb.from("TimeEntry").select("id", { count: "exact", head: true }).eq("approved", false).not("clockOut", "is", null),
    sb.from("Invoice").select("status, total, issueDate").in("status", ["SENT", "PAID"]),
    sb.from("Assignment").select("serviceTypeId, location:Location!inner(clientId)").eq("status", "COMPLETED").is("invoiceId", null).not("location.clientId", "is", null),
    sb.from("Shift").select("*, user:User!Shift_userId_fkey(name)").is("clockOut", null),
    sb.from("TimeOff").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    sb.from("ShiftClaim").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
    sb.from("Shift").select("id", { count: "exact", head: true }).eq("approved", false).not("clockOut", "is", null),
    sb.from("Assignment").select("userId, date, startTime, endTime").gte("date", today()).lte("date", wk.sunday).eq("status", "SCHEDULED").not("userId", "is", null),
  ]);
  const jobs = must(r1, "jobs") as JobRow[];
  const onClock = must(r2, "on the clock") as (TimeEntry & { user: Pick<Profile, "name">; assignment: { location: Pick<Location, "name"> } | null })[];
  const flagged = must(r3, "flags") as (Checkin & { user: Pick<Profile, "name">; location: Pick<Location, "name"> | null; depot: Pick<SupplyDepot, "name"> | null })[];
  const issues = r4.count ?? 0;
  const stock = must(r5, "stock") as (StockLevel & { supply: Pick<Supply, "name" | "reorderAt">; depot: Pick<SupplyDepot, "name"> })[];
  const unapproved = r6.count ?? 0;
  const invoices = must(r7, "invoices") as Pick<Invoice, "status" | "total" | "issueDate">[];
  const sent = invoices.filter((i) => i.status === "SENT");
  const outstanding = { total: sent.reduce((s, i) => s + Number(i.total), 0), count: sent.length };
  const paidMonth = invoices.filter((i) => i.status === "PAID" && i.issueDate >= monthStart).reduce((s, i) => s + Number(i.total), 0);
  const errorsWeek = owner ? ((await sb.from("AppError").select("id", { count: "exact", head: true }).gte("at", todayUTC(-7).toISOString())).count ?? 0) : 0;
  const unbilled = must(r8, "unbilled") as unknown as { serviceTypeId: string | null; location: { clientId: string | null } }[];
  const shiftsOpen = must(r10, "shifts") as (Shift & { user: Pick<Profile, "name"> })[];
  const requests = (r11.count ?? 0) + (r12.count ?? 0);
  const unapprovedAll = unapproved + (r13.count ?? 0);
  const ahead = must(r14, "upcoming") as { userId: string; date: string; startTime: string; endTime: string | null }[];
  const rules = await getRules();
  const team = [...new Set([...shiftsOpen.map((s) => s.userId), ...ahead.map((a) => a.userId), ...onClock.map((e) => e.userId)])];
  const worked = await weekHours(team);
  const names = Object.fromEntries([...shiftsOpen.map((s) => [s.userId, s.user.name]), ...onClock.map((e) => [e.userId, e.user.name])]);
  const nearOT = team.map((id) => ({ id, h: (worked[id] ?? 0) + ahead.filter((a) => a.userId === id).reduce((s, a) => s + jobHours(a), 0) }))
    .filter((x) => x.h > rules.overtimeHours - 2);
  if (nearOT.some((x) => !names[x.id])) {
    const rows = must(await sb.from("User").select("id, name").in("id", nearOT.map((x) => x.id)), "team") as Pick<Profile, "id" | "name">[];
    for (const r of rows) names[r.id] = r.name;
  }
  const low = stock.filter((s) => s.quantity <= s.supply.reorderAt);
  const unassigned = jobs.filter((j) => !j.userId).length;
  const rate = await rateBook();
  const unbilledAmt = unbilled.reduce((s, a) => s + (rate(a.location.clientId, a.serviceTypeId) ?? 0), 0);
  const unpriced = unbilled.filter((a) => rate(a.location.clientId, a.serviceTypeId) == null).length;
  const laborMonth = owner ? (await payrollFor(new Date(monthStart + "T06:00:00Z"), new Date(), false)).reduce((s, r) => s + r.gross, 0) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Jobs today" value={jobs.length} hint={unassigned ? `${unassigned} unassigned` : "all covered"} tone={unassigned ? "amber" : "slate"} href="/jobs" />
        <Stat label="On the clock" value={shiftsOpen.length} hint={`${onClock.length} on site now`} tone="green" href="/time" />
        <Stat label="Open issues" value={issues} tone={issues ? "amber" : "slate"} href="/issues" />
        <Stat label="Low stock" value={low.length} tone={low.length ? "red" : "slate"} href="/inventory" />
      </div>
      {owner && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Outstanding A/R" value={money(outstanding.total)} hint={`${outstanding.count} sent invoices`} tone="blue" href="/invoices" />
          <Stat label="Paid this month" value={money(paidMonth)} tone="green" />
          <Stat label="Ready to bill" value={money(unbilledAmt)} hint={unpriced ? `${unpriced} visit${unpriced === 1 ? " has" : "s have"} no price set` : `${unbilled.length} completed visits`} tone={unpriced ? "amber" : "slate"} href="/invoices/new" />
          <Stat label="Labor this month" value={money(laborMonth)} hint={`${unapprovedAll} entries to approve`} href="/payroll" />
        </div>
      )}
      {errorsWeek > 0 && (
        <Link href="/activity?tab=errors" className="block rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorsWeek} app error{errorsWeek === 1 ? "" : "s"} in the last 7 days. See what happened →</Link>
      )}
      {!owner && unapprovedAll > 0 && (
        <Link href="/time" className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><Clock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{unapprovedAll} time entries waiting for approval →</Link>
      )}
      {requests > 0 && (
        <Link href="/requests" className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{requests} request{requests === 1 ? "" : "s"} for time off or open shifts to decide →</Link>
      )}
      {nearOT.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <TriangleAlert className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Near overtime this week (worked + scheduled):{" "}
          {nearOT.map((x) => `${names[x.id] ?? "Someone"} ${x.h.toFixed(1)} h`).join(", ")}. Overtime starts after {rules.overtimeHours} h.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="h2">Today&apos;s board</h2><Link href="/jobs/new" className="btn-primary">New job</Link></div>
          {jobs.length ? <JobList jobs={jobs} showUser /> : <Empty>Nothing scheduled today.</Empty>}
        </section>
        <section className="space-y-5">
          <div>
            <h2 className="h2 mb-2">On the clock</h2>
            {shiftsOpen.filter((s) => !onClock.some((e) => e.userId === s.userId)).length > 0 && (
              <div className="card mb-2 divide-y divide-slate-100 p-0">
                {shiftsOpen.filter((s) => !onClock.some((e) => e.userId === s.userId)).map((s) => (
                  <div key={s.id} className="flex justify-between p-3 text-sm">
                    <span><span className="font-medium">{s.user.name}</span> · between jobs</span>
                    <span className="text-slate-500">since {fmtTime(s.clockIn)}</span>
                  </div>
                ))}
              </div>
            )}
            {onClock.length ? (
              <div className="card divide-y divide-slate-100 p-0">
                {onClock.map((e) => (
                  <Link key={e.id} href={`/jobs/${e.assignmentId}`} className="flex justify-between p-3 text-sm hover:bg-slate-50">
                    <span><span className="font-medium">{e.user.name}</span> · {e.assignment?.location.name}</span>
                    <span className="text-slate-500">{hoursBetween(e.clockIn, new Date()).toFixed(1)}h</span>
                  </Link>
                ))}
              </div>
            ) : <Empty>Nobody is checked in at a job right now.</Empty>}
          </div>
          <div>
            <h2 className="h2 mb-2">Check-ins off site (7 days)</h2>
            {flagged.length ? (
              <div className="card divide-y divide-slate-100 p-0">
                {flagged.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span><span className="font-medium">{c.user.name}</span> · <Badge value={c.type} /> {c.location?.name ?? c.depot?.name}<br /><span className="text-xs text-slate-500">{fmtDateTime(c.at)}</span></span>
                    <FenceBadge within={c.withinFence} distance={c.distanceM} />
                  </div>
                ))}
              </div>
            ) : <Empty>All check-ins were inside the geofence.</Empty>}
          </div>
          {low.length > 0 && (
            <div>
              <h2 className="h2 mb-2">Reorder soon</h2>
              <div className="card divide-y divide-slate-100 p-0">
                {low.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex justify-between p-3 text-sm"><span>{s.supply.name} <span className="text-slate-500">· {s.depot.name}</span></span><span className="font-semibold text-red-600">{s.quantity} left</span></div>
                ))}
              </div>
            </div>
          )}
          <details className="card">
            <summary className="cursor-pointer font-semibold">Post an announcement</summary>
            <AnnouncementForm />
          </details>
        </section>
      </div>
    </div>
  );
}

function AnnouncementForm() {
  return (
    <form action={postAnnouncement} className="mt-3 space-y-2">
      <input name="title" className="input" placeholder="Title" required />
      <textarea name="body" className="input" rows={3} placeholder="Message for the team" />
      <button className="btn-primary">Post</button>
    </form>
  );
}
