import type { TaskDef } from "./types";

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
 * Tasks a manager can add to a room with one tap instead of typing: the common tasks of every
 * other room type, then tasks already written for other rooms on this plan. Skips anything the
 * room already has (its own type's common tasks or its own extras) and repeats of the same label.
 */
export function taskSuggestions(
  commonTasks: Record<string, TaskDef[]>, rooms: { key: string; customTasks: TaskDef[] }[], room: { key: string; type: string; customTasks: TaskDef[] },
): (TaskDef & { from: string })[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const seen = new Set([...(commonTasks[room.type] ?? []), ...room.customTasks].map((t) => norm(t.label)));
  const out: (TaskDef & { from: string })[] = [];
  const add = (t: TaskDef, from: string) => {
    const k = norm(t.label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ label: t.label.trim(), minutes: t.minutes ?? null, serviceTypeIds: [...(t.serviceTypeIds ?? [])], from });
  };
  for (const [type, list] of Object.entries(commonTasks)) if (type !== room.type) for (const t of list) add(t, type);
  for (const r of rooms) if (r.key !== room.key) for (const t of r.customTasks) add(t, "This plan");
  return out;
}
