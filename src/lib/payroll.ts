import "server-only";
import { admin, must } from "./supabase/server";
import { hoursBetween, payWeek } from "./format";
import type { Profile, TimeEntry } from "./types";

export type PayrollRow = {
  userId: string; name: string; email: string; waveEmployeeId: string | null; rate: number;
  regular: number; overtime: number; gross: number; entries: number; unapproved: number;
};

type Entry = TimeEntry & { user: Pick<Profile, "name" | "email" | "waveEmployeeId" | "hourlyRate"> };

/** Hours per employee in [from, to). Overtime = hours over 40 in any Mon–Sun week (Chicago time). */
export async function payrollFor(from: Date, to: Date, approvedOnly: boolean): Promise<PayrollRow[]> {
  const entries = must(
    await admin().from("TimeEntry").select("*, user:User!TimeEntry_userId_fkey(*)")
      .gte("clockIn", from.toISOString()).lt("clockIn", to.toISOString()).not("clockOut", "is", null).order("clockIn"),
    "time entries",
  ) as Entry[];
  return computePayroll(entries, approvedOnly);
}

/** Pure payroll maths (unit-tested): regular vs overtime per pay week, gross at 1.5× overtime. */
export function computePayroll(entries: Entry[], approvedOnly: boolean): PayrollRow[] {
  const rows = new Map<string, PayrollRow & { weeks: Map<string, number> }>();
  for (const e of entries) {
    const r = rows.get(e.userId) ?? {
      userId: e.userId, name: e.user.name, email: e.user.email, waveEmployeeId: e.user.waveEmployeeId, rate: Number(e.user.hourlyRate),
      regular: 0, overtime: 0, gross: 0, entries: 0, unapproved: 0, weeks: new Map(),
    };
    r.entries++;
    if (!e.approved) r.unapproved++;
    rows.set(e.userId, r);
    if (approvedOnly && !e.approved) continue;
    const wk = payWeek(e.clockIn); // Mon–Sun week in Chicago time
    r.weeks.set(wk, (r.weeks.get(wk) ?? 0) + hoursBetween(e.clockIn, e.clockOut));
  }
  return [...rows.values()].map(({ weeks, ...r }) => {
    for (const h of weeks.values()) { r.regular += Math.min(h, 40); r.overtime += Math.max(0, h - 40); }
    r.regular = Math.round(r.regular * 100) / 100;
    r.overtime = Math.round(r.overtime * 100) / 100;
    r.gross = Math.round((r.regular * r.rate + r.overtime * r.rate * 1.5) * 100) / 100;
    return r;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
