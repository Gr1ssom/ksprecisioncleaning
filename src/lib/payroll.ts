import "server-only";
import { db } from "./db";
import { hoursBetween } from "./format";

export type PayrollRow = {
  userId: string; name: string; email: string; waveEmployeeId: string | null; rate: number;
  regular: number; overtime: number; gross: number; entries: number; unapproved: number;
};

/** Hours per employee in [from, to). Overtime = hours over 40 in any Mon–Sun week. */
export async function payrollFor(from: Date, to: Date, approvedOnly: boolean): Promise<PayrollRow[]> {
  const entries = await db.timeEntry.findMany({
    where: { clockIn: { gte: from, lt: to }, clockOut: { not: null } },
    include: { user: true },
    orderBy: { clockIn: "asc" },
  });
  const rows = new Map<string, PayrollRow & { weeks: Map<string, number> }>();
  for (const e of entries) {
    const r = rows.get(e.userId) ?? {
      userId: e.userId, name: e.user.name, email: e.user.email, waveEmployeeId: e.user.waveEmployeeId, rate: Number(e.user.hourlyRate),
      regular: 0, overtime: 0, gross: 0, entries: 0, unapproved: 0, weeks: new Map(),
    };
    r.entries++;
    if (!e.approved) r.unapproved++;
    if (approvedOnly && !e.approved) { rows.set(e.userId, r); continue; }
    const d = new Date(e.clockIn);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const wk = monday.toISOString().slice(0, 10);
    r.weeks.set(wk, (r.weeks.get(wk) ?? 0) + hoursBetween(e.clockIn, e.clockOut));
    rows.set(e.userId, r);
  }
  return [...rows.values()].map(({ weeks, ...r }) => {
    for (const h of weeks.values()) { r.regular += Math.min(h, 40); r.overtime += Math.max(0, h - 40); }
    r.regular = Math.round(r.regular * 100) / 100;
    r.overtime = Math.round(r.overtime * 100) / 100;
    r.gross = Math.round((r.regular * r.rate + r.overtime * r.rate * 1.5) * 100) / 100;
    return r;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
