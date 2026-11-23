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

