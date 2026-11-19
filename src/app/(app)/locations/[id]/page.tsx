import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
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
  const loc = await db.location.findUnique({ where: { id }, include: { client: true, sops: { orderBy: { title: "asc" } } } });
  if (!loc) notFound();
  const mgr = user.role !== "STAFF";
  const [layouts, clients, report] = await Promise.all([
    layoutsWithTasks(id),
    mgr ? db.client.findMany({ orderBy: { name: "asc" } }) : [],
    mgr ? roomTimeReport(id, 90) : null,
  ]);

  return (
    <>
      <PageHeader title={loc.name} subtitle={loc.address + (loc.client ? ` · ${loc.client.name}` : "")}
        action={mgr && <Link href={`/jobs/new?locationId=${loc.id}`} className="btn-primary">New job</Link>} />
      {loc.accessNotes && <div className="card mb-5 text-sm">🔑 {loc.accessNotes}</div>}

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
              <summary className="cursor-pointer font-semibold text-brand-600">＋ Add SOP for this location</summary>
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
