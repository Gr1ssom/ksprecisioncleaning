/** Business timezone. All "today"/clock displays use it, regardless of server TZ (Vercel runs UTC). */
export const APP_TZ = "America/Chicago";

export const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: APP_TZ });

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: APP_TZ });

type When = Date | string;
const ms = (d: When) => (typeof d === "string" ? new Date(d).getTime() : d.getTime());

export const hoursBetween = (a: When, b: When | null | undefined) =>
  b ? Math.max(0, (ms(b) - ms(a)) / 3_600_000) : 0;

/** Today's business date as a UTC-midnight Date (DATE columns are compared as YYYY-MM-DD). */
export function todayUTC(offsetDays = 0) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays));
}

export const isoDay = (d: When) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Business date as "YYYY-MM-DD", offset by n days — use for DATE column filters. */
export const today = (offsetDays = 0) => isoDay(todayUTC(offsetDays));

export type Task = { label: string; done: boolean };
export type Line = { description: string; quantity: number; unitPrice: number };

export const lineTotal = (lines: Line[]) =>
  Math.round(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0) * 100) / 100;

/** Parse a datetime-local value ("2026-11-19T18:30") as wall-clock time in APP_TZ. */
export function fromLocalInput(v: string) {
  const [d, t] = v.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (t ?? "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const p = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(guess));
  const g = (k: string) => Number(p.find((x) => x.type === k)!.value);
  const wall = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (wall - guess));
}
