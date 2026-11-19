import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { addRoomTypeTask } from "@/app/actions/manage";
import { DeleteTask } from "./DeleteTask";

export const dynamic = "force-dynamic";

export default async function Settings() {
  await requireUser("MANAGER");
  const tasks = await db.roomTypeTask.findMany({ orderBy: [{ roomType: "asc" }, { sortOrder: "asc" }] });
  const usage = await db.room.groupBy({ by: ["type"], _count: true });
  const types = [...new Set(tasks.map((t) => t.roomType))];
  return (
    <>
      <PageHeader title="Room tasks" subtitle="Common checklists by room type. Every traced room of that type gets these, plus its own custom tasks." />
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
