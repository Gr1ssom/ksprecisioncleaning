import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { addRoomTypeTask, saveServiceType, updateRoomTypeTask } from "@/app/actions/manage";
import type { RoomTypeTask, ServiceType } from "@/lib/types";
import { DeleteTask } from "./DeleteTask";

export const dynamic = "force-dynamic";

function ServicePicker({ services, selected, name = "serviceTypeIds" }: { services: ServiceType[]; selected: string[]; name?: string }) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Applies to</legend>
      {services.map((t) => (
        <label key={t.id} className="chip cursor-pointer border border-slate-300 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
          <input type="checkbox" name={name} value={t.id} defaultChecked={selected.includes(t.id)} className="sr-only" />{t.name}
        </label>
      ))}
    </fieldset>
  );
}

export default async function Settings() {
  await requireUser("MANAGER");
  const sb = admin();
  const [tr, rr, sr, ar] = await Promise.all([
    sb.from("RoomTypeTask").select("*").order("roomType").order("sortOrder"),
    sb.from("Room").select("type"),
    sb.from("ServiceType").select("*").order("sortOrder").order("name"),
    sb.from("Assignment").select("serviceTypeId"),
  ]);
  const tasks = must(tr, "room tasks") as RoomTypeTask[];
  const roomTypes = must(rr, "rooms") as { type: string }[];
  const services = must(sr, "services") as ServiceType[];
  const jobs = must(ar, "jobs") as { serviceTypeId: string | null }[];
  const types = [...new Set(tasks.map((t) => t.roomType))];
  const active = services.filter((t) => t.active);
  const svcName = (id: string) => services.find((t) => t.id === id)?.name ?? "?";

  return (
    <>
      <PageHeader title="Settings" />
      <section className="mb-8">
        <h2 className="h2">Service types</h2>
        <p className="muted mb-3">The kinds of visit you sell. Each client gets its own price per service type on the Clients page.</p>
        <div className="card max-w-2xl divide-y divide-slate-100 p-0">
          {services.map((t) => (
            <form key={t.id} action={saveServiceType} className="flex flex-wrap items-center gap-2 p-3">
              <input type="hidden" name="id" value={t.id} />
              <input name="name" defaultValue={t.name} className="input min-w-40 flex-1" required />
              <select name="active" defaultValue={t.active ? "on" : "off"} className="input w-32"><option value="on">Offered</option><option value="off">Retired</option></select>
              <span className="w-16 text-right text-xs text-slate-500">{jobs.filter((j) => j.serviceTypeId === t.id).length} jobs</span>
              <button className="btn-secondary">Save</button>
            </form>
          ))}
          <form action={saveServiceType} className="flex gap-2 p-3">
            <input name="name" className="input flex-1" placeholder="New service, e.g. Move-out clean" required />
            <button className="btn-primary">Add</button>
          </form>
        </div>
      </section>

      <h2 className="h2">Room tasks</h2>
      <p className="muted mb-3">
        Common checklists by room type. Every room of that type on a floor plan gets these, plus its own tasks.
        Limit a task to certain services (e.g. &ldquo;Inside oven&rdquo; only on a Deep clean) and add minutes to estimate how long a room takes.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => {
          const list = tasks.filter((t) => t.roomType === type);
          const est = list.filter((t) => !t.serviceTypeIds.length).reduce((s, t) => s + (t.minutes ?? 0), 0);
          return (
            <div key={type} className="card">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-serif text-xl font-black">{type}</h3>
                <span className="text-xs text-slate-500">{roomTypes.filter((r) => r.type === type).length} rooms{est ? ` · ~${est} min` : ""}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {list.map((t) => (
                  <li key={t.id} className="flex items-start gap-1">
                    <details className="flex-1 py-1">
                      <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span>{t.label}</span>
                        {t.minutes ? <span className="text-xs text-slate-500">{t.minutes} min</span> : null}
                        {t.serviceTypeIds.map((id) => <span key={id} className="badge bg-slate-100 text-slate-700">{svcName(id)} only</span>)}
                      </summary>
                      <form action={updateRoomTypeTask} className="mt-2 space-y-2 pb-2">
                        <input type="hidden" name="id" value={t.id} />
                        <div className="flex gap-2">
                          <input name="label" defaultValue={t.label} className="input flex-1" required />
                          <input name="minutes" type="number" min="0" defaultValue={t.minutes ?? ""} placeholder="min" className="input w-20" />
                        </div>
                        <div className="eyebrow">Only on (none = every visit)</div>
                        <ServicePicker services={active} selected={t.serviceTypeIds} />
                        <button className="btn-secondary">Save</button>
                      </form>
                    </details>
                    <DeleteTask id={t.id} />
                  </li>
                ))}
              </ul>
              <details className="mt-2">
                <summary className="text-sm font-semibold">Add tasks</summary>
                <form action={addRoomTypeTask} className="mt-2 space-y-2">
                  <input type="hidden" name="roomType" value={type} />
                  <textarea name="labels" rows={3} className="input" placeholder="One per line" required />
                  <div className="flex items-center gap-2"><input name="minutes" type="number" min="0" className="input w-24" placeholder="min each" /></div>
                  <div className="eyebrow">Only on (none = every visit)</div>
                  <ServicePicker services={active} selected={[]} />
                  <button className="btn-primary">Add</button>
                </form>
              </details>
            </div>
          );
        })}
        <div className="card">
          <h3 className="mb-2 font-serif text-xl font-black">New room type</h3>
          <form action={addRoomTypeTask} className="space-y-2">
            <input name="roomType" className="input" placeholder="e.g. Laundry, Gym, Conference" required />
            <textarea name="labels" rows={4} className="input" placeholder="Tasks, one per line" required />
            <input name="minutes" type="number" min="0" className="input w-28" placeholder="min each" />
            <button className="btn-primary">Create</button>
          </form>
        </div>
      </div>
    </>
  );
}
