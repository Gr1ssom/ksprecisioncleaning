import { BookOpen, KeyRound, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { usualRoomMinutes } from "@/lib/reports";
import { signedUrls } from "@/lib/storage";
import type { Assignment, Checkin, Location, Profile, RoomPhoto, RoomSession, RoomTaskCheck, ServiceType, Sop, TimeEntry } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { layoutsWithTasks } from "@/lib/rooms";
import { Badge, FenceBadge, PageHeader } from "@/components/ui";
import { GeoForm } from "@/components/GeoForm";
import { siteCheckIn, siteCheckOut } from "@/app/actions/field";
import { fmtDate, fmtDateTime, hoursBetween } from "@/lib/format";
import { clashesFor } from "@/lib/work";
import { claimShift, decideClaim } from "@/app/actions/requests";
import type { ShiftClaim } from "@/lib/types";
import { TriangleAlert } from "lucide-react";
import { RoomMap } from "./RoomMap";
import { TaskList, StatusButtons } from "./JobControls";
import { ClipboardCheck, Star } from "lucide-react";
import { ShareLink } from "@/components/ShareLink";
import { baseUrl, emailConfigured } from "@/lib/email";
import { emailReport, makeReportLink } from "@/app/actions/quality";
import { reportRecipient } from "@/lib/clientReports";
import type { Inspection, VisitFeedback, VisitReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; created?: string; inspected?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const sb = admin();
  type TE = TimeEntry;
  const raw = must(await sb.from("Assignment").select(`*, location:Location(*, sops:Sop(id, title)), user:User!Assignment_userId_fkey(name),
      serviceType:ServiceType(name), checkins:Checkin(*, user:User(name)), timeEntry:TimeEntry(*), roomSessions:RoomSession(*), roomChecks:RoomTaskCheck(*), roomPhotos:RoomPhoto(*)`)
    .eq("id", id).maybeSingle(), "job") as (Assignment & {
      location: Location & { sops: Pick<Sop, "id" | "title">[] }; user: Pick<Profile, "name"> | null; serviceType: Pick<ServiceType, "name"> | null;
      checkins: (Checkin & { user: Pick<Profile, "name"> })[]; timeEntry: TE | TE[] | null; roomSessions: RoomSession[]; roomChecks: RoomTaskCheck[]; roomPhotos: RoomPhoto[];
    }) | null;
  if (!raw) notFound();
  const a = { ...raw, timeEntry: Array.isArray(raw.timeEntry) ? raw.timeEntry[0] ?? null : raw.timeEntry };
  a.checkins.sort((x, y) => x.at.localeCompare(y.at));
  if (user.role === "STAFF" && a.userId !== user.id && a.userId !== null) notFound();
  const layouts = await layoutsWithTasks(a.locationId, a.serviceTypeId);
  const [companySops, usual, photoUrls] = await Promise.all([
    // Company-wide SOPs plus the ones for this site's client.
    sb.from("Sop").select("id, title, clientId").is("locationId", null).then((r) => (must(r, "SOPs") as Pick<Sop, "id" | "title" | "clientId">[]).filter((x) => !x.clientId || x.clientId === raw.location.clientId)),
    usualRoomMinutes(layouts.flatMap((l) => l.rooms.map((r) => r.id))),
    signedUrls(a.roomPhotos.map((p) => p.path)),
  ]);
  const mgr = user.role !== "STAFF";
  const claims = must(await sb.from("ShiftClaim").select("*, user:User!ShiftClaim_userId_fkey(name)").eq("assignmentId", a.id).eq("status", "PENDING").order("createdAt"), "requests") as (ShiftClaim & { user: Pick<Profile, "name"> })[];
  const myClaim = claims.find((c) => c.userId === user.id);
  // Quality and client side (managers): inspection, client report link, client rating, re-cleans.
  const [insp, report, feedback, followUps, origin, client, base] = mgr ? await Promise.all([
    sb.from("Inspection").select("id, score, completedAt").eq("assignmentId", a.id).maybeSingle().then((r) => must(r, "inspection") as Pick<Inspection, "id" | "score" | "completedAt"> | null),
    sb.from("VisitReport").select("*").eq("assignmentId", a.id).maybeSingle().then((r) => must(r, "report") as VisitReport | null),
    sb.from("VisitFeedback").select("*").eq("assignmentId", a.id).maybeSingle().then((r) => must(r, "rating") as VisitFeedback | null),
    sb.from("Assignment").select("id, date, status").eq("followUpOfId", a.id).order("date").then((r) => must(r, "re-cleans") as Pick<Assignment, "id" | "date" | "status">[]),
    a.followUpOfId ? sb.from("Assignment").select("id, date").eq("id", a.followUpOfId).maybeSingle().then((r) => must(r, "original job") as Pick<Assignment, "id" | "date"> | null) : null,
    raw.location.clientId ? sb.from("Client").select("name, email, reportEmail, reportsEnabled").eq("id", raw.location.clientId).maybeSingle().then((r) => must(r, "client") as { name: string; email: string | null; reportEmail: string | null; reportsEnabled: boolean } | null) : null,
    baseUrl(),
  ]) : [null, null, null, [], null, null, ""];
  // Managers see problems with who's on this job (time off, availability, overlap, overtime).
  const warnings = mgr && a.userId && a.status === "SCHEDULED" ? await clashesFor(a, a.userId) : [];
  const photos: Record<string, { id: string; kind: "before" | "after"; url: string }[]> = {};
  for (const p of [...a.roomPhotos].sort((x, y) => x.createdAt.localeCompare(y.createdAt)))
    if (photoUrls[p.path]) (photos[p.roomId] ??= []).push({ id: p.id, kind: p.kind, url: photoUrls[p.path] });

  const mine = a.userId === user.id || mgr;
  const inProgress = a.status === "IN_PROGRESS";
  const canWork = inProgress && mine;
  const spentSec: Record<string, number> = {};
  for (const s of a.roomSessions) if (s.endedAt) spentSec[s.roomId] = (spentSec[s.roomId] ?? 0) + (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000;
  const open = a.roomSessions.find((s) => !s.endedAt && (s.userId === user.id || user.role !== "STAFF"));
  const tasks = a.tasks ?? [];

  return (
    <>
      <PageHeader
        title={a.location.name}
        subtitle={`${a.serviceType?.name ?? "Clean"} · ${fmtDate(a.date)} · ${a.startTime}${a.endTime ? `–${a.endTime}` : ""} · ${a.user?.name ?? "Unassigned"}`}
        action={<div className="flex items-center gap-2"><Badge value={a.status} />{user.role !== "STAFF" && <Link href={`/jobs/${a.id}/edit`} className="btn-secondary">Edit</Link>}</div>}
      />
      {sp.done && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Checked out. Nice work!</div>}
      {sp.created === "followup" && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Re-clean booked. The cleaner and managers were told.</div>}
      {sp.inspected && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Inspection saved. The cleaner was told the result.</div>}
      {(a.followUpOfId || a.noCharge) && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {a.followUpOfId ? <>Re-clean{origin ? <> for the <Link className="font-semibold underline" href={`/jobs/${origin.id}`}>{fmtDate(origin.date)} visit</Link></> : ""}. </> : null}
          {a.noCharge ? "No charge: this visit is never invoiced." : ""}
        </div>
      )}
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-semibold"><TriangleAlert className="mr-1 inline h-4 w-4 align-[-3px]" />Check this assignment</div>
          <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {!a.userId && a.status === "SCHEDULED" && (
        <div className="card mb-4 border-dashed border-amber-400">
          <div className="font-semibold">Open shift</div>
          {!mgr && (myClaim
            ? <p className="mt-1 text-sm text-slate-600">You asked for this shift. Your manager will decide.</p>
            : <form action={claimShift.bind(null, a.id)} className="mt-2"><button className="btn-primary">Ask for this shift</button></form>)}
          {mgr && (claims.length ? (
            <div className="mt-2 divide-y divide-slate-100">
              {claims.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span><b>{c.user.name}</b> asked {fmtDateTime(c.createdAt)}</span>
                  <span className="flex gap-2">
                    <form action={decideClaim.bind(null, c.id, true)}><button className="btn-success">Approve</button></form>
                    <form action={decideClaim.bind(null, c.id, false)}><button className="btn-secondary">Deny</button></form>
                  </span>
                </div>
              ))}
            </div>
          ) : <p className="mt-1 text-sm text-slate-500">Nobody has asked for it yet. Staff see it on their dashboard.</p>)}
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="card md:col-span-2">
          <div className="text-xs text-slate-500">{a.location.address}</div>
          {a.location.accessNotes && <p className="mt-2 text-sm"><KeyRound className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{a.location.accessNotes}</p>}
          {a.notes && <p className="mt-2 text-sm"><StickyNote className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{a.notes}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(a.location.address)}`}>Directions</a>
            <Link className="btn-secondary" href={`/locations/${a.locationId}`}>Location & SOPs</Link>
            <Link className="btn-secondary" href={`/issues?new=1&locationId=${a.locationId}&back=/jobs/${a.id}`}>Report issue</Link>
          </div>
        </div>
        <div className="card">
          {a.status === "SCHEDULED" && mine && (
            <GeoForm action={siteCheckIn} submitLabel="Check in" offline="checkIn">
              <input type="hidden" name="assignmentId" value={a.id} />
            </GeoForm>
          )}
          {inProgress && mine && (
            <GeoForm action={siteCheckOut} submitLabel="Check out" className="btn-danger w-full" offline="checkOut">
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

      {mgr && (a.status === "COMPLETED" || a.status === "IN_PROGRESS") && (
        <section className="mb-6 grid gap-3 md:grid-cols-2">
          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="h2">Inspection</h2>
              <Link href={`/jobs/${a.id}/inspect`} className={insp?.completedAt ? "btn-secondary" : "btn-primary"}><ClipboardCheck className="h-4 w-4" />{insp ? (insp.completedAt ? "View" : "Continue") : "Inspect"}</Link>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {insp?.completedAt ? <>Score <b>{insp.score}</b> · {fmtDateTime(insp.completedAt)}</> : insp ? "Started, not finished." : "Walk the rooms on the floor plan and score each one."}
            </p>
            {followUps.length > 0 && (
              <ul className="mt-2 text-sm">{followUps.map((f) => <li key={f.id}><Link className="inline-flex min-h-11 items-center gap-2 underline underline-offset-2" href={`/jobs/${f.id}`}>Re-clean {fmtDate(f.date)}</Link> <Badge value={f.status} /></li>)}</ul>
            )}
            {feedback && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <div className="eyebrow mb-1">Client rating</div>
                <span className="inline-flex items-center gap-0.5 font-semibold">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= feedback.rating ? "fill-current" : ""}`} />)}<span className="ml-1">{feedback.rating}/5</span></span>
                {feedback.comment && <p className="mt-1 text-slate-600">“{feedback.comment}”</p>}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="h2">Client report</h2>
            {!raw.location.clientId ? <p className="mt-2 text-sm text-slate-500">This location has no client, so there&apos;s no one to send a report to.</p>
              : report ? (
                <div className="mt-2 space-y-2">
                  <p className="text-sm text-slate-600">
                    {report.sentAt ? <>Emailed to {report.sentTo} · {fmtDateTime(report.sentAt)}</> : client?.reportsEnabled ? "Ready to send." : `Reports are off for ${client?.name ?? "this client"}; you can still share this one.`}
                  </p>
                  {report.emailError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{report.emailError}</p>}
                  <ShareLink url={`${base}/r/${report.token}`} text={`Your visit report from KS Precision Cleaning (${fmtDate(a.date)}):`}
                    emailReady={emailConfigured() && !!reportRecipient(client)} email={emailReport.bind(null, a.id)} />
                </div>
              ) : (
                <form action={makeReportLink.bind(null, a.id)} className="mt-2 space-y-2">
                  <p className="text-sm text-slate-600">Rooms done, before/after photos, time by room and the cleaner&apos;s note, on a link the client opens without signing in.</p>
                  <button className="btn-secondary">Make client link</button>
                </form>
              )}
          </div>
        </section>
      )}

      {layouts.some((l) => l.rooms.length) ? (
        <section className="mb-6">
          <h2 className="h2 mb-2">Room map</h2>
          {!inProgress && a.status === "SCHEDULED" && <p className="muted mb-2">Check in to start room timers and tick off tasks.</p>}
          <RoomMap assignmentId={a.id} layouts={layouts.filter((l) => l.rooms.length)} canWork={canWork} canStart={a.status === "SCHEDULED" && mine}
            checks={a.roomChecks.map((c) => `${c.roomId}|${c.label}`)} spentSec={spentSec}
            active={open ? { roomId: open.roomId, startedAt: open.startedAt } : null} usual={usual} photos={photos} />
        </section>
      ) : user.role !== "STAFF" ? (
        <p className="muted mb-6">No floor plan yet. <Link className="text-brand-600 underline" href={`/locations/${a.locationId}`}>Trace one on the location</Link> to unlock the room map and room timers.</p>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {tasks.length > 0 && (
          <section>
            <h2 className="h2 mb-2">Job checklist</h2>
            <TaskList id={a.id} tasks={tasks} canWork={canWork} canStart={a.status === "SCHEDULED" && mine} />
          </section>
        )}
        <section>
          <h2 className="h2 mb-2">SOPs</h2>
          <div className="card divide-y divide-slate-100 py-1 text-sm">
            {[...a.location.sops, ...companySops].map((s) => <Link key={s.id} href={`/sops#${s.id}`} className="flex min-h-11 items-center text-slate-800 underline-offset-2 hover:underline"><BookOpen className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{s.title}</Link>)}
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
