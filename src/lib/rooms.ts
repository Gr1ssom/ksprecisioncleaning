import "server-only";
import { admin, must } from "./supabase/server";
import { signedUrls } from "./storage";
import type { Layout, Room, RoomTypeTask, TaskDef } from "./types";

export type RoomTask = { label: string; custom: boolean; minutes: number | null };
export type PlanRoomFull = { id: string; name: string; type: string; points: number[][]; color: string; notes: string | null; sortOrder: number; tasks: RoomTask[]; estMinutes: number };
export type PlanLayout = { id: string; name: string; imageUrl: string | null; imagePath: string | null; aspect: number; rooms: PlanRoomFull[] };

/** Does a task apply to this visit? Empty serviceTypeIds = every visit; no service = show all. */
export const appliesTo = (t: { serviceTypeIds?: string[] | null }, serviceTypeId?: string | null) =>
  !serviceTypeId || !t.serviceTypeIds?.length || t.serviceTypeIds.includes(serviceTypeId);

export function normalizeTasks(raw: unknown): TaskDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => (typeof t === "string" ? { label: t, serviceTypeIds: [], minutes: null } : (t as TaskDef)))
    .filter((t) => t && t.label?.trim());
}

/**
 * Floor plans for a location with each room's checklist = common tasks for its type + its own tasks,
 * filtered to the visit's service type when given. Rooms come in cleaning order.
 */
export async function layoutsWithTasks(locationId: string, serviceTypeId?: string | null): Promise<PlanLayout[]> {
  const sb = admin();
  const [layouts, common] = await Promise.all([
    must(await sb.from("Layout").select("*, rooms:Room(*)").eq("locationId", locationId).order("sortOrder").order("name"), "layouts") as (Layout & { rooms: Room[] })[],
    must(await sb.from("RoomTypeTask").select("*").order("sortOrder"), "room tasks") as RoomTypeTask[],
  ]);
  const urls = await signedUrls(layouts.map((l) => l.imagePath));
  return layouts.map((l) => ({
    id: l.id, name: l.name, aspect: l.aspect, imagePath: l.imagePath, imageUrl: l.imagePath ? urls[l.imagePath] ?? null : null,
    rooms: [...l.rooms].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((r) => {
      const tasks: RoomTask[] = [
        ...common.filter((c) => c.roomType === r.type && appliesTo(c, serviceTypeId)).map((c) => ({ label: c.label, custom: false, minutes: c.minutes })),
        ...normalizeTasks(r.customTasks).filter((t) => appliesTo(t, serviceTypeId)).map((t) => ({ label: t.label, custom: true, minutes: t.minutes })),
      ];
      return {
        id: r.id, name: r.name, type: r.type, points: r.points, color: r.color, notes: r.notes, sortOrder: r.sortOrder, tasks,
        estMinutes: tasks.reduce((s, t) => s + (t.minutes ?? 0), 0),
      };
    }),
  }));
}
