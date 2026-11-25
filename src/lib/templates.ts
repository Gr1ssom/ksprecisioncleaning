// Job templates per location. Pure (no server-only), unit-tested.

export type JobTemplate = {
  serviceTypeId: string | null; startTime: string | null; endTime: string | null;
  userId: string | null; tasks: string[]; notes: string | null;
};

const time = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Read a stored template (anything) as a clean template, or null if it holds nothing. */
export function parseTemplate(raw: unknown): JobTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t: JobTemplate = {
    serviceTypeId: text(r.serviceTypeId), startTime: time(r.startTime), endTime: time(r.endTime), userId: text(r.userId),
    tasks: Array.isArray(r.tasks) ? r.tasks.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, 100) : [],
    notes: text(r.notes),
  };
  return t.serviceTypeId || t.startTime || t.endTime || t.userId || t.tasks.length || t.notes ? t : null;
}

/** What the New job form shows for a location: its template, else the plain defaults. */
export function jobDefaults(t: JobTemplate | null, fallbackServiceId: string | undefined) {
  return {
    serviceTypeId: t?.serviceTypeId ?? fallbackServiceId ?? "",
    startTime: t?.startTime ?? "18:00",
    endTime: t?.endTime ?? "",
    userId: t?.userId ?? "",
    tasks: (t?.tasks ?? []).join("\n"),
    notes: t?.notes ?? "",
  };
}
