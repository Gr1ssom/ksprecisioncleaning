import { KeyRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { RoomHeatmap } from "@/components/RoomHeatmap";
import type { Client, Location, Sop } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { layoutsWithTasks } from "@/lib/rooms";
import { PageHeader } from "@/components/ui";
import { createLayout, saveSop } from "@/app/actions/manage";
import { LocationForm } from "../LocationForm";
import { PlanPreview } from "./PlanPreview";
import { roomTimeReport } from "@/lib/reports";
import { RoomTimeTable } from "@/components/RoomTimeTable";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sb = admin();
  const loc = must(await sb.from("Location").select("*, client:Client(name), sops:Sop(*)").eq("id", id).maybeSingle(), "location") as (Location & { client: Pick<Client, "name"> | null; sops: Sop[] }) | null;
  if (!loc) notFound();
  loc.sops.sort((a, b) => a.title.localeCompare(b.title));
  const mgr = user.role !== "STAFF";
  const [layouts, clients, report] = await Promise.all([
    layoutsWithTasks(id),
    mgr ? (must(await sb.from("Client").select("id, name").order("name"), "clients") as Pick<Client, "id" | "name">[]) : [],
    mgr ? roomTimeReport(id, 90) : null,
  ]);

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
              <summary className="cursor-pointer font-semibold">{s.title} <span className="text-xs font-normal text-slate-500">· {s.category} · v{s.version}</span></summary>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{s.body.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol>
              {mgr && (
                <form action={saveSop} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={s.id} /><input type="hidden" name="locationId" value={loc.id} />
                  <div className="grid grid-cols-2 gap-2"><input name="title" defaultValue={s.title} className="input" /><input name="category" defaultValue={s.category} className="input" /></div>
                  <textarea name="body" defaultValue={s.body} rows={5} className="input" />
                  <button className="btn-secondary">Save as new version</button>
                </form>
              )}
            </details>
          ))}
          {loc.sops.length === 0 && <p className="muted">No location-specific SOPs. Company SOPs still apply.</p>}
          {mgr && (
            <details className="card">
              <summary className="cursor-pointer font-semibold text-brand-600">Add SOP for this location</summary>
              <form action={saveSop} className="mt-3 space-y-2">
                <input type="hidden" name="locationId" value={loc.id} />
                <div className="grid grid-cols-2 gap-2"><input name="title" placeholder="Title" className="input" required /><input name="category" placeholder="Category" className="input" /></div>
                <textarea name="body" rows={5} className="input" placeholder="One step per line" required />
                <button className="btn-primary">Add</button>
              </form>
            </details>
          )}
        </div>
      </section>

      {mgr && (
        <details className="card max-w-2xl">
          <summary className="cursor-pointer font-semibold">Location settings</summary>
          <div className="mt-3"><LocationForm loc={loc} clients={clients} /></div>
        </details>
      )}
    </>
  );
}
