import Link from "next/link";
import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { layoutsWithTasks } from "@/lib/rooms";
import { signedUrls } from "@/lib/storage";
import { PageHeader } from "@/components/ui";
import { fmtDate, today } from "@/lib/format";
import { finishInspection } from "@/app/actions/quality";
import { inspectionScore, RESULT_LABEL } from "@/lib/quality";
import type { Assignment, Inspection, InspectionRoom, Profile } from "@/lib/types";
import { InspectMap } from "./InspectMap";

export const dynamic = "force-dynamic";

export default async function InspectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const sp = await searchParams;
  const sb = admin();
  const a = must(await sb.from("Assignment").select("*, location:Location(name), user:User!Assignment_userId_fkey(name), serviceType:ServiceType(name)").eq("id", id).maybeSingle(), "job") as
    (Assignment & { location: { name: string }; user: Pick<Profile, "name"> | null; serviceType: { name: string } | null }) | null;
  if (!a) notFound();
  const [layouts, insp, staff] = await Promise.all([
    layoutsWithTasks(a.locationId, a.serviceTypeId),
    sb.from("Inspection").select("*, rooms:InspectionRoom(*)").eq("assignmentId", a.id).maybeSingle().then((r) => must(r, "inspection") as (Inspection & { rooms: InspectionRoom[] }) | null),
    sb.from("User").select("id, name").eq("active", true).order("name").then((r) => must(r, "team") as { id: string; name: string }[]),
  ]);
  const scored = insp?.rooms ?? [];
  const photos = await signedUrls(scored.map((r) => r.photoPath));
  const plans = layouts.filter((l) => l.rooms.length);
  const roomCount = plans.reduce((s, l) => s + l.rooms.length, 0);
  const fails = scored.filter((r) => r.result === "FAIL");
  const score = inspectionScore(scored.map((r) => r.result));

  return (
    <>
      <PageHeader title={`Inspect: ${a.location.name}`}
        subtitle={`${a.serviceType?.name ?? "Clean"} · ${fmtDate(a.date)} · cleaned by ${a.user?.name ?? "nobody assigned"}`}
        action={<Link href={`/jobs/${a.id}`} className="btn-secondary">Back to job</Link>} />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {a.status !== "COMPLETED" && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This job isn&apos;t checked out yet. You can still score rooms; the cleaner may still be working.</div>}
      {insp?.completedAt && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Finished. Score {insp.score}. You can change room scores and finish again.</div>}
      {plans.length === 0 ? (
        <p className="muted">No floor plan here yet. <Link className="underline" href={`/locations/${a.locationId}`}>Trace one on the location</Link> to inspect room by room.</p>
      ) : (
        <InspectMap assignmentId={a.id}
          layouts={plans.map((l) => ({ id: l.id, name: l.name, imageUrl: l.imageUrl, aspect: l.aspect, rooms: l.rooms.map((r) => ({ id: r.id, name: r.name, points: r.points, color: r.color, type: r.type })) }))}
          scores={Object.fromEntries(scored.filter((r) => r.roomId).map((r) => [r.roomId!, { result: r.result, note: r.note, photoUrl: r.photoPath ? photos[r.photoPath] ?? null : null }]))} />
      )}

      {plans.length > 0 && (
        <form action={finishInspection} className="card mt-5 max-w-2xl space-y-3">
          <input type="hidden" name="assignmentId" value={a.id} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="h2">Finish inspection</h2>
            <span className="text-sm text-slate-600">{scored.length}/{roomCount} rooms scored{score != null && <> · score <b>{score}</b></>}</span>
          </div>
          {scored.length > 0 && (
            <p className="text-sm text-slate-600">{(["PASS", "TOUCH_UP", "FAIL"] as const).map((k) => `${scored.filter((r) => r.result === k).length} ${RESULT_LABEL[k].toLowerCase()}`).join(" · ")}</p>
          )}
          <textarea name="note" rows={2} className="input" defaultValue={insp?.note ?? ""} placeholder="Overall note (optional)" />
          {fails.length > 0 && (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="label px-1">Re-clean for {fails.length} failed room{fails.length === 1 ? "" : "s"}</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="followUp" value="yes" defaultChecked />Book a free re-clean job</label>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-sm"><span className="label">Date</span><input type="date" name="followUpDate" defaultValue={today(1)} className="input" /></label>
                <label className="text-sm"><span className="label">Start</span><input type="time" name="followUpStart" defaultValue={a.startTime} className="input" /></label>
                <label className="text-sm"><span className="label">Who</span>
                  <select name="followUpUserId" defaultValue={a.userId ?? ""} className="input"><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                </label>
              </div>
            </fieldset>
          )}
          <button className="btn-primary" disabled={!scored.length}>Finish</button>
        </form>
      )}
    </>
  );
}
