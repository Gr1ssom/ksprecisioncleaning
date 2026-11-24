import { KeyRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { RoomHeatmap } from "@/components/RoomHeatmap";
import type { Client, Location, Sop } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { layoutsWithTasks } from "@/lib/rooms";
import { PageHeader } from "@/components/ui";
import { createLayout } from "@/app/actions/manage";
import { SopForm } from "@/components/SopForm";
import { SopContent } from "@/components/SopContent";
import { signedUrls } from "@/lib/storage";
import { LocationForm } from "../LocationForm";
import { PlanPreview } from "./PlanPreview";
import { roomTimeReport } from "@/lib/reports";
import { RoomTimeTable } from "@/components/RoomTimeTable";
import { serviceTypes } from "@/lib/pricing";
import { parseTemplate } from "@/lib/templates";
import { saveJobTemplate } from "@/app/actions/quality";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { id } = await params;
  const sb = admin();
  const loc = must(await sb.from("Location").select("*, client:Client(name), sops:Sop(*)").eq("id", id).maybeSingle(), "location") as (Location & { client: Pick<Client, "name"> | null; sops: Sop[] }) | null;
  if (!loc) notFound();
  // SOPs for this site, plus the ones written for its client as a whole.
  if (loc.clientId) loc.sops.push(...(must(await sb.from("Sop").select("*").eq("clientId", loc.clientId), "client SOPs") as Sop[]));
  loc.sops.sort((a, b) => a.title.localeCompare(b.title));
  const sopFiles = await signedUrls(loc.sops.map((s) => s.filePath));
  const mgr = user.role !== "STAFF";
  const [layouts, clients, report, services, staff] = await Promise.all([
    layoutsWithTasks(id),
    mgr ? (must(await sb.from("Client").select("id, name").order("name"), "clients") as Pick<Client, "id" | "name">[]) : [],
    mgr ? roomTimeReport(id, 90) : null,
    mgr ? serviceTypes() : [],
    mgr ? (must(await sb.from("User").select("id, name").eq("active", true).order("name"), "team") as { id: string; name: string }[]) : [],
  ]);
  const tpl = parseTemplate(loc.jobTemplate);

  return (
    <>
      <PageHeader title={loc.name} subtitle={loc.address + (loc.client ? ` · ${loc.client.name}` : "")}
        action={mgr && <Link href={`/jobs/new?locationId=${loc.id}`} className="btn-primary">New job</Link>} />
      {loc.accessNotes && <div className="card mb-5 text-sm"><KeyRound className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{loc.accessNotes}</div>}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">Floor plans</h2>
          {mgr && (
            <form action={createLayout} className="flex gap-2">
              <input type="hidden" name="locationId" value={loc.id} />
              <input name="name" className="input w-36" placeholder="e.g. Upstairs" />
              <button className="btn-secondary">Add</button>
            </form>
          )}
        </div>
        {layouts.length === 0 ? (
          <p className="muted">No floor plans yet.{mgr && " Add one, then upload a photo of the plan (or draw on the grid) and trace each room."}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {layouts.map((l) => (
              <div key={l.id} className="card">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">{l.name} <span className="text-xs font-normal text-slate-500">· {l.rooms.length} rooms</span></div>
                  {mgr && <Link href={`/locations/${loc.id}/layouts/${l.id}`} className="btn-secondary text-xs">Edit rooms</Link>}
                </div>
                <PlanPreview layout={l} />
              </div>
            ))}
          </div>
        )}
      </section>

      {report && report.rooms.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between"><h2 className="h2">Where time goes (90 days)</h2><Link href={`/reports?locationId=${loc.id}`} className="text-sm text-brand-600">Client report →</Link></div>
          {layouts.some((l) => l.rooms.length) && (
            <div className="mb-3">
              <RoomHeatmap layouts={layouts.filter((l) => l.rooms.length).map((l) => ({ id: l.id, name: l.name, imageUrl: l.imageUrl, aspect: l.aspect, rooms: l.rooms }))}
                minutes={Object.fromEntries(report.rooms.map((r) => [r.roomId, r.avgMin]))} />
            </div>
          )}
          <RoomTimeTable report={report} />
        </section>
      )}

      <section className="mb-6">
        <h2 className="h2 mb-2">Location SOPs</h2>
        <div className="space-y-3">
          {loc.sops.map((s) => (
            <details key={s.id} className="card">
              <summary className="cursor-pointer font-semibold">{s.title} <span className="text-xs font-normal text-slate-500">· {s.category} · v{s.version}{s.clientId && ` · all ${loc.client?.name ?? "client"} locations`}</span></summary>
              <SopContent sop={s} fileUrl={s.filePath ? sopFiles[s.filePath] : undefined} />
              {mgr && (s.clientId
                ? <Link href={`/sops#${s.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-2">Edit on the SOPs page</Link>
                : (
                  <details className="mt-3 border-t border-slate-100 pt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Edit</summary>
                    <SopForm sop={s} scope={`location:${loc.id}`} back={`/locations/${loc.id}`} />
                  </details>
                ))}
            </details>
          ))}
          {loc.sops.length === 0 && <p className="muted">No SOPs for this location or its client. Company SOPs still apply.</p>}
          {mgr && (
            <details className="card">
              <summary className="cursor-pointer font-semibold text-brand-600">Add SOP for this location</summary>
              <SopForm scope={`location:${loc.id}`} back={`/locations/${loc.id}`} />
            </details>
          )}
        </div>
      </section>

      {mgr && (
        <section className="mb-6">
          <h2 className="h2">Job template</h2>
          <p className="muted mb-2">New jobs here start with these. Room tasks still come from the floor plan.</p>
          {sp.saved === "template" && <div className="mb-3 max-w-2xl rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Template saved. New jobs here fill in from it.</div>}
          <form action={saveJobTemplate} className="card max-w-2xl space-y-3">
            <input type="hidden" name="locationId" value={loc.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="label">Service</span>
                <select name="serviceTypeId" defaultValue={tpl?.serviceTypeId ?? ""} className="input"><option value="">No default</option>{services.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              </label>
              <label className="text-sm"><span className="label">Usual cleaner</span>
                <select name="userId" defaultValue={tpl?.userId ?? ""} className="input"><option value="">No default</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm"><span className="label">Usual start</span><input type="time" name="startTime" defaultValue={tpl?.startTime ?? ""} className="input" /></label>
                <label className="text-sm"><span className="label">Usual end</span><input type="time" name="endTime" defaultValue={tpl?.endTime ?? ""} className="input" /></label>
              </div>
            </div>
            <label className="block text-sm"><span className="label">Standard job checklist (one per line)</span>
              <textarea name="tasks" rows={3} defaultValue={(tpl?.tasks ?? []).join("\n")} className="input" placeholder={"Empty all bins\nLock the back door"} />
            </label>
            <label className="block text-sm"><span className="label">Job notes</span><textarea name="notes" rows={2} defaultValue={tpl?.notes ?? ""} className="input" /></label>
            <button className="btn-primary">Save</button>
          </form>
        </section>
      )}

      {mgr && (
        <details className="card max-w-2xl">
          <summary className="cursor-pointer font-semibold">Location settings</summary>
          <div className="mt-3"><LocationForm loc={loc} clients={clients} /></div>
        </details>
      )}
    </>
  );
}
