import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { layoutsWithTasks } from "@/lib/rooms";
import { Badge, FenceBadge, PageHeader } from "@/components/ui";
import { GeoForm } from "@/components/GeoForm";
import { siteCheckIn, siteCheckOut } from "@/app/actions/field";
import { fmtDate, fmtDateTime, hoursBetween, type Task } from "@/lib/format";
import { RoomMap } from "./RoomMap";
import { TaskList, StatusButtons } from "./JobControls";

export const dynamic = "force-dynamic";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const a = await db.assignment.findUnique({
    where: { id },
    include: { location: { include: { sops: true } }, user: true, checkins: { include: { user: true }, orderBy: { at: "asc" } }, timeEntry: true, roomSessions: true, roomChecks: true },
  });
  if (!a) notFound();
  if (user.role === "STAFF" && a.userId !== user.id && a.userId !== null) notFound();
  const layouts = await layoutsWithTasks(a.locationId);
  const companySops = await db.sop.findMany({ where: { locationId: null }, select: { id: true, title: true } });

  const mine = a.userId === user.id || user.role !== "STAFF";
  const inProgress = a.status === "IN_PROGRESS";
  const canWork = inProgress && mine;
  const spentSec: Record<string, number> = {};
  for (const s of a.roomSessions) if (s.endedAt) spentSec[s.roomId] = (spentSec[s.roomId] ?? 0) + (s.endedAt.getTime() - s.startedAt.getTime()) / 1000;
  const open = a.roomSessions.find((s) => !s.endedAt && (s.userId === user.id || user.role !== "STAFF"));
  const tasks = (a.tasks as Task[]) ?? [];

  return (
    <>
      <PageHeader
        title={a.location.name}
        subtitle={`${fmtDate(a.date)} · ${a.startTime}${a.endTime ? `–${a.endTime}` : ""} · ${a.user?.name ?? "Unassigned"}`}
        action={<div className="flex items-center gap-2"><Badge value={a.status} />{user.role !== "STAFF" && <Link href={`/jobs/${a.id}/edit`} className="btn-secondary">Edit</Link>}</div>}
      />
      {sp.done && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Checked out. Nice work! ✨</div>}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="card md:col-span-2">
          <div className="text-xs text-slate-500">{a.location.address}</div>
          {a.location.accessNotes && <p className="mt-2 text-sm">🔑 {a.location.accessNotes}</p>}
          {a.notes && <p className="mt-2 text-sm">📝 {a.notes}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(a.location.address)}`}>Directions</a>
            <Link className="btn-secondary" href={`/locations/${a.locationId}`}>Location & SOPs</Link>
            <Link className="btn-secondary" href={`/issues?new=1&locationId=${a.locationId}&back=/jobs/${a.id}`}>Report issue</Link>
          </div>
        </div>
        <div className="card">
          {a.status === "SCHEDULED" && mine && (
            <GeoForm action={siteCheckIn} submitLabel="Check in">
              <input type="hidden" name="assignmentId" value={a.id} />
            </GeoForm>
          )}
          {inProgress && mine && (
            <GeoForm action={siteCheckOut} submitLabel="Check out" className="btn-danger w-full">
              <input type="hidden" name="assignmentId" value={a.id} />
              <input name="note" className="input" placeholder="Note for the client or manager (optional)" />
            </GeoForm>
          )}
          {a.timeEntry && (
            <div className="mt-2 text-sm text-slate-600">
              On site: <b>{hoursBetween(a.timeEntry.clockIn, a.timeEntry.clockOut ?? new Date()).toFixed(2)} h</b>
              {a.timeEntry.approved && <span className="badge ml-2 bg-emerald-100 text-emerald-700">approved</span>}
            </div>
          )}
          {user.role !== "STAFF" && <StatusButtons id={a.id} status={a.status} />}
        </div>
      </div>

      {layouts.some((l) => l.rooms.length) ? (
        <section className="mb-6">
          <h2 className="h2 mb-2">Room map</h2>
          {!inProgress && a.status === "SCHEDULED" && <p className="muted mb-2">Check in to start room timers and tick off tasks.</p>}
          <RoomMap assignmentId={a.id} layouts={layouts.filter((l) => l.rooms.length)} canWork={canWork}
            checks={a.roomChecks.map((c) => `${c.roomId}|${c.label}`)} spentSec={spentSec}
            active={open ? { roomId: open.roomId, startedAt: open.startedAt.toISOString() } : null} />
        </section>
      ) : user.role !== "STAFF" ? (
        <p className="muted mb-6">No floor plan yet. <Link className="text-brand-600 underline" href={`/locations/${a.locationId}`}>Trace one on the location</Link> to unlock the room map and room timers.</p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {tasks.length > 0 && (
          <section>
            <h2 className="h2 mb-2">Job checklist</h2>
            <TaskList id={a.id} tasks={tasks} canWork={canWork} />
          </section>
        )}
        <section>
          <h2 className="h2 mb-2">SOPs</h2>
          <div className="card space-y-1 text-sm">
            {[...a.location.sops, ...companySops].map((s) => <Link key={s.id} href={`/sops#${s.id}`} className="block text-brand-600 hover:underline">📘 {s.title}</Link>)}
          </div>
        </section>
        {a.checkins.length > 0 && (
          <section>
            <h2 className="h2 mb-2">Check-in log</h2>
            <div className="card divide-y divide-slate-100 p-0 text-sm">
              {a.checkins.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-3">
                  <span><Badge value={c.type} /> {c.user.name} · {fmtDateTime(c.at)}{c.note && <span className="block text-xs text-slate-500">“{c.note}”</span>}</span>
                  <FenceBadge within={c.withinFence} distance={c.distanceM} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
