import "server-only";
import { db } from "./db";

/** Layouts for a location with each room's full checklist (common tasks for its type + its custom tasks). */
export async function layoutsWithTasks(locationId: string) {
  const [layouts, common] = await Promise.all([
    db.layout.findMany({ where: { locationId }, include: { rooms: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.roomTypeTask.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  return layouts.map((l) => ({
    id: l.id, name: l.name, imageData: l.imageData, aspect: l.aspect,
    rooms: l.rooms.map((r) => ({
      id: r.id, name: r.name, type: r.type, points: r.points as number[][], color: r.color, notes: r.notes,
      tasks: [
        ...common.filter((c) => c.roomType === r.type).map((c) => ({ label: c.label, custom: false })),
        ...((r.customTasks as string[]) ?? []).map((label) => ({ label, custom: true })),
      ],
    })),
  }));
}
