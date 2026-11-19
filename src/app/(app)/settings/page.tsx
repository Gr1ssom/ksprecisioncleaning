import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { addRoomTypeTask, saveServiceType } from "@/app/actions/manage";
import { DeleteTask } from "./DeleteTask";

export const dynamic = "force-dynamic";

export default async function Settings() {
  await requireUser("MANAGER");
  const tasks = await db.roomTypeTask.findMany({ orderBy: [{ roomType: "asc" }, { sortOrder: "asc" }] });
  const usage = await db.room.groupBy({ by: ["type"], _count: true });
  const types = [...new Set(tasks.map((t) => t.roomType))];
  const services = await db.serviceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { assignments: true } } } });
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
              <input name="name" defaultValue={t.name} className="input flex-1" required />
              <select name="active" defaultValue={t.active ? "on" : "off"} className="input w-32"><option value="on">Offered</option><option value="off">Retired</option></select>
              <span className="w-16 text-right text-xs text-slate-500">{t._count.assignments} jobs</span>
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
      <p className="muted mb-3">Common checklists by room type. Every traced room of that type gets these, plus its own custom tasks.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => (
          <div key={type} className="card">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{type}</h2><span className="text-xs text-slate-500">{usage.find((u) => u.type === type)?._count ?? 0} rooms</span></div>
            <ul className="space-y-1 text-sm">
              {tasks.filter((t) => t.roomType === type).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded px-1 hover:bg-slate-50"><span>{t.label}</span><DeleteTask id={t.id} /></li>
              ))}
            </ul>
            <form action={addRoomTypeTask} className="mt-2 flex gap-2">
              <input type="hidden" name="roomType" value={type} />
              <input name="labels" className="input" placeholder="Add a task" required />
              <button className="btn-secondary">Add</button>
            </form>
          </div>
        ))}
        <div className="card">
          <h2 className="mb-2 font-semibold">New room type</h2>
          <form action={addRoomTypeTask} className="space-y-2">
            <input name="roomType" className="input" placeholder="e.g. Laundry, Gym, Conference" required />
            <textarea name="labels" rows={4} className="input" placeholder="Tasks, one per line" required />
            <button className="btn-primary">Create</button>
          </form>
        </div>
      </div>
    </>
  );
}
