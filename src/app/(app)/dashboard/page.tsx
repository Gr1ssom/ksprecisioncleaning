import Link from "next/link";
import { db } from "@/lib/db";
import { postAnnouncement } from "@/app/actions/manage";
import { rateBook } from "@/lib/pricing";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, FenceBadge, PageHeader, Stat } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtTime, hoursBetween, money, todayUTC, type Task } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const announcements = await db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 2 });
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })} />
      {announcements.map((a) => (
        <div key={a.id} className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm">
          <div className="font-semibold text-brand-700">📣 {a.title}</div>
          <div className="mt-1 text-slate-700">{a.body}</div>
        </div>
      ))}
      {user.role === "STAFF" ? <StaffDash userId={user.id} /> : <ManagerDash owner={user.role === "OWNER"} />}
    </>
  );
}

async function StaffDash({ userId }: { userId: string }) {
  const today = todayUTC();
  const [jobs, upcoming, active, weekEntries, open] = await Promise.all([
    db.assignment.findMany({ where: { userId, date: today, status: { not: "CANCELLED" } }, include: { location: true, serviceType: true }, orderBy: { startTime: "asc" } }),
    db.assignment.findMany({ where: { userId, date: { gt: today, lte: todayUTC(7) }, status: "SCHEDULED" }, include: { location: true, serviceType: true }, orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    db.timeEntry.findFirst({ where: { userId, clockOut: null }, include: { assignment: { include: { location: true } } } }),
    db.timeEntry.findMany({ where: { userId, clockIn: { gte: todayUTC(-((todayUTC().getUTCDay() + 6) % 7)) } } }),
    db.assignment.findMany({ where: { userId: null, date: { gte: today }, status: "SCHEDULED" }, include: { location: true }, take: 3 }),
  ]);
  const weekHours = weekEntries.reduce((s, e) => s + hoursBetween(e.clockIn, e.clockOut ?? new Date()), 0);
  return (
    <div className="space-y-5">
      {active?.assignment ? (
        <Link href={`/jobs/${active.assignmentId}`} className="block rounded-xl bg-emerald-600 p-4 text-white shadow">
          <div className="text-xs font-semibold uppercase opacity-80">On the clock</div>
          <div className="text-lg font-bold">{active.assignment.location.name}</div>
          <div className="text-sm opacity-90">Since {fmtTime(active.clockIn)} · tap to open the room map</div>
        </Link>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/checkin?mode=pickup" className="card text-center hover:border-brand-500"><div className="text-3xl">📦</div><div className="mt-1 font-semibold">Supply pickup</div></Link>
          <Link href="/checkin?mode=site" className="card text-center hover:border-brand-500"><div className="text-3xl">📍</div><div className="mt-1 font-semibold">Arrive at site</div></Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Jobs today" value={jobs.length} />
        <Stat label="Hours this week" value={weekHours.toFixed(1)} href="/time" />
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
          <p className="muted mb-2">Ask your manager to pick these up.</p>
          <JobList jobs={open} showDate />
        </section>
      )}
    </div>
  );
}

type JobRow = { id: string; date: Date; startTime: string; endTime: string | null; status: string; tasks: unknown; location: { name: string; address: string }; user?: { name: string } | null; serviceType?: { name: string } | null };
function JobList({ jobs, showDate, showUser }: { jobs: JobRow[]; showDate?: boolean; showUser?: boolean }) {
  return (
    <div className="space-y-2">
      {jobs.map((j) => {
        const t = (j.tasks as Task[]) ?? [];
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
  const today = todayUTC();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [jobs, onClock, flagged, issues, stock, unapproved, outstanding, paidMonth, unbilled, monthHours] = await Promise.all([
    db.assignment.findMany({ where: { date: today, status: { not: "CANCELLED" } }, include: { location: true, user: true, serviceType: true }, orderBy: { startTime: "asc" } }),
    db.timeEntry.findMany({ where: { clockOut: null }, include: { user: true, assignment: { include: { location: true } } } }),
    db.checkin.findMany({ where: { withinFence: false, at: { gte: todayUTC(-7) } }, include: { user: true, location: true, depot: true }, orderBy: { at: "desc" }, take: 5 }),
    db.issue.count({ where: { status: "OPEN" } }),
    db.stockLevel.findMany({ include: { supply: true, depot: true } }),
    db.timeEntry.count({ where: { approved: false, clockOut: { not: null } } }),
    db.invoice.aggregate({ where: { status: "SENT" }, _sum: { total: true }, _count: true }),
    db.invoice.aggregate({ where: { status: "PAID", issueDate: { gte: monthStart } }, _sum: { total: true } }),
    db.assignment.findMany({ where: { status: "COMPLETED", invoiceId: null, location: { clientId: { not: null } } }, include: { location: true } }),
    db.timeEntry.findMany({ where: { clockIn: { gte: monthStart }, clockOut: { not: null } }, include: { user: true } }),
  ]);
  const low = stock.filter((s) => s.quantity <= s.supply.reorderAt);
  const unassigned = jobs.filter((j) => !j.userId).length;
  const rate = await rateBook();
  const unbilledAmt = unbilled.reduce((s, a) => s + (rate(a.location.clientId, a.serviceTypeId) ?? 0), 0);
  const unpriced = unbilled.filter((a) => rate(a.location.clientId, a.serviceTypeId) == null).length;
  const laborMonth = monthHours.reduce((s, e) => s + hoursBetween(e.clockIn, e.clockOut) * Number(e.user.hourlyRate), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Jobs today" value={jobs.length} hint={unassigned ? `${unassigned} unassigned` : "all covered"} tone={unassigned ? "amber" : "slate"} href="/jobs" />
        <Stat label="On the clock" value={onClock.length} tone="green" />
        <Stat label="Open issues" value={issues} tone={issues ? "amber" : "slate"} href="/issues" />
        <Stat label="Low stock" value={low.length} tone={low.length ? "red" : "slate"} href="/inventory" />
      </div>
      {owner && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Outstanding A/R" value={money(outstanding._sum.total)} hint={`${outstanding._count} sent invoices`} tone="blue" href="/invoices" />
          <Stat label="Paid this month" value={money(paidMonth._sum.total)} tone="green" />
          <Stat label="Ready to bill" value={money(unbilledAmt)} hint={unpriced ? `${unpriced} visit${unpriced === 1 ? " has" : "s have"} no price set` : `${unbilled.length} completed visits`} tone={unpriced ? "amber" : "slate"} href="/invoices/new" />
          <Stat label="Labor this month" value={money(laborMonth)} hint={`${unapproved} entries to approve`} href="/payroll" />
        </div>
      )}
      {!owner && unapproved > 0 && (
        <Link href="/time" className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">⏱️ {unapproved} time entries waiting for approval →</Link>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="h2">Today&apos;s board</h2><Link href="/jobs/new" className="btn-primary">New job</Link></div>
          {jobs.length ? <JobList jobs={jobs} showUser /> : <Empty>Nothing scheduled today.</Empty>}
        </section>
        <section className="space-y-5">
          <div>
            <h2 className="h2 mb-2">Live on site</h2>
            {onClock.length ? (
              <div className="card divide-y divide-slate-100 p-0">
                {onClock.map((e) => (
                  <Link key={e.id} href={`/jobs/${e.assignmentId}`} className="flex justify-between p-3 text-sm hover:bg-slate-50">
                    <span><span className="font-medium">{e.user.name}</span> · {e.assignment?.location.name}</span>
                    <span className="text-slate-500">{hoursBetween(e.clockIn, new Date()).toFixed(1)}h</span>
                  </Link>
                ))}
              </div>
            ) : <Empty>Nobody is checked in right now.</Empty>}
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
            ) : <Empty>All check-ins were inside the geofence. 👍</Empty>}
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
