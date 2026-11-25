"use client";
import { useState } from "react";
import { saveAssignment } from "@/app/actions/manage";
import type { jobDefaults } from "@/lib/templates";

type Opt = { id: string; name: string };
type Defaults = ReturnType<typeof jobDefaults>;

/**
 * New / edit job. A new job fills in from the location's job template (service, usual times and
 * cleaner, checklist, notes) and refills when another location is picked.
 */
export function JobForm({ locations, staff, serviceTypes, job, defaults, templates = {}, today }: {
  locations: Opt[]; staff: Opt[]; serviceTypes: Opt[]; today?: string;
  job?: { id: string; locationId: string; serviceTypeId: string | null; userId: string | null; date: string; startTime: string; endTime: string | null; notes: string | null; tasks: { label: string; done: boolean }[] };
  defaults?: { locationId?: string; date?: string };
  /** Per location: what a new job starts with (from its template, else plain defaults). */
  templates?: Record<string, Defaults>;
}) {
  const firstLoc = job?.locationId ?? defaults?.locationId ?? locations[0]?.id ?? "";
  const fill = (loc: string): Defaults => templates[loc] ?? { serviceTypeId: serviceTypes[0]?.id ?? "", startTime: "18:00", endTime: "", userId: "", tasks: "", notes: "" };
  const [locationId, setLocationId] = useState(firstLoc);
  const [v, setV] = useState<Defaults>(() => job
    ? { serviceTypeId: job.serviceTypeId ?? serviceTypes[0]?.id ?? "", startTime: job.startTime, endTime: job.endTime ?? "", userId: job.userId ?? "", tasks: job.tasks.map((t) => t.label).join("\n"), notes: job.notes ?? "" }
    : fill(firstLoc));
  const set = (k: keyof Defaults) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const fromTemplate = !job && !!templates[locationId];

  return (
    <form action={saveAssignment} className="card max-w-2xl space-y-4">
      {job && <input type="hidden" name="id" value={job.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="jf-loc">Location</label>
          <select id="jf-loc" name="locationId" className="input" value={locationId} required
            onChange={(e) => { setLocationId(e.target.value); if (!job) setV(fill(e.target.value)); }}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {fromTemplate && <p className="mt-1 text-xs text-slate-500">Filled in from this location&apos;s job template.</p>}
        </div>
        <div>
          <label className="label" htmlFor="jf-svc">Service</label>
          <select id="jf-svc" name="serviceTypeId" className="input" value={v.serviceTypeId} onChange={set("serviceTypeId")} required>
            {serviceTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="jf-user">Assign to</label>
          <select id="jf-user" name="userId" className="input" value={v.userId} onChange={set("userId")}>
            <option value="">Unassigned (open shift)</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="jf-date">Date</label>
          <input id="jf-date" type="date" name="date" className="input" defaultValue={job?.date ?? defaults?.date ?? today} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="jf-start">Start</label><input id="jf-start" type="time" name="startTime" className="input" value={v.startTime} onChange={set("startTime")} required /></div>
          <div><label className="label" htmlFor="jf-end">End</label><input id="jf-end" type="time" name="endTime" className="input" value={v.endTime} onChange={set("endTime")} /></div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="jf-tasks">Job checklist (one per line)</label>
        <textarea id="jf-tasks" name="tasks" rows={4} className="input" placeholder={"Room tasks come from the floor plan.\nAdd anything extra for this visit here."}
          value={v.tasks} onChange={set("tasks")} />
      </div>
      <div>
        <label className="label" htmlFor="jf-notes">Notes</label>
        <textarea id="jf-notes" name="notes" rows={2} className="input" value={v.notes} onChange={set("notes")} />
      </div>
      {!job && (
        <div>
          <label className="label" htmlFor="jf-repeat">Repeat weekly for</label>
          <select id="jf-repeat" name="repeatWeeks" className="input w-48" defaultValue="0">
            <option value="0">Just once</option>
            {[1, 3, 7, 11, 25].map((w) => <option key={w} value={w}>{w + 1} weeks</option>)}
          </select>
        </div>
      )}
      <button className="btn-primary">{job ? "Save" : "Create"}</button>
    </form>
  );
}
