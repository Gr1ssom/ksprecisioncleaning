import { saveAssignment } from "@/app/actions/manage";
import { today } from "@/lib/format";

type Opt = { id: string; name: string };
export function JobForm({ locations, staff, serviceTypes, job, defaults }: {
  locations: Opt[]; staff: Opt[]; serviceTypes: Opt[];
  job?: { id: string; locationId: string; serviceTypeId: string | null; userId: string | null; date: string; startTime: string; endTime: string | null; notes: string | null; tasks: { label: string; done: boolean }[] };
  defaults?: { locationId?: string; date?: string };
}) {
  return (
    <form action={saveAssignment} className="card max-w-2xl space-y-4">
      {job && <input type="hidden" name="id" value={job.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Location</label>
          <select name="locationId" className="input" defaultValue={job?.locationId ?? defaults?.locationId} required>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Service</label>
          <select name="serviceTypeId" className="input" defaultValue={job?.serviceTypeId ?? serviceTypes[0]?.id} required>
            {serviceTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Assign to</label>
          <select name="userId" className="input" defaultValue={job?.userId ?? ""}>
            <option value="">Unassigned (open shift)</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" name="date" className="input" defaultValue={job?.date ?? defaults?.date ?? today()} required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Start</label><input type="time" name="startTime" className="input" defaultValue={job?.startTime ?? "18:00"} required /></div>
          <div><label className="label">End</label><input type="time" name="endTime" className="input" defaultValue={job?.endTime ?? ""} /></div>
        </div>
      </div>
      <div>
        <label className="label">Job checklist (one per line)</label>
        <textarea name="tasks" rows={4} className="input" placeholder={"Room tasks come from the floor plan.\nAdd anything extra for this visit here."}
          defaultValue={(job?.tasks ?? []).map((t) => t.label).join("\n")} />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea name="notes" rows={2} className="input" defaultValue={job?.notes ?? ""} />
      </div>
      {!job && (
        <div>
          <label className="label">Repeat weekly for</label>
          <select name="repeatWeeks" className="input w-48" defaultValue="0">
            <option value="0">Just once</option>
            {[1, 3, 7, 11, 25].map((w) => <option key={w} value={w}>{w + 1} weeks</option>)}
          </select>
        </div>
      )}
      <button className="btn-primary">{job ? "Save" : "Create"}</button>
    </form>
  );
}
