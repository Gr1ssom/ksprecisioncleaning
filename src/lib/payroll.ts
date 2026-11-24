import "server-only";
import { admin, must } from "./supabase/server";
import { getRules } from "./settings";
import { paidSpans, splitOvertime, totalMiles, type BreakRow, type Rules, type Worked } from "./worktime";
import type { Profile, TimeEntry } from "./types";

export type PayrollRow = {
  userId: string; name: string; email: string; waveEmployeeId: string | null; rate: number;
  regular: number; overtime: number; gross: number; entries: number; unapproved: number;
  miles: number; mileagePay: number;
};

type Person = Pick<Profile, "id" | "name" | "email" | "waveEmployeeId" | "hourlyRate">;
export type PayInput = { user: Person; shifts: Worked[]; jobs: Worked[]; breaks: BreakRow[]; points?: { at: string; lat: number | null; lng: number | null }[] };

/**
 * Pay per employee for shifts that start in [from, to). Paid time follows the owner's rules
 * (Settings): whole shifts or job time only, breaks paid or not. Overtime = over 40 h in a
 * Mon–Sun week, Chicago time.
 */
export async function payrollFor(from: Date, to: Date, approvedOnly: boolean): Promise<PayrollRow[]> {
  const sb = admin();
  const [ur, sr, jr, br, cr, rules] = await Promise.all([
    sb.from("User").select("id, name, email, waveEmployeeId, hourlyRate"),
    sb.from("Shift").select("userId, clockIn, clockOut, approved").gte("clockIn", from.toISOString()).lt("clockIn", to.toISOString()).not("clockOut", "is", null),
    sb.from("TimeEntry").select("userId, clockIn, clockOut, approved").gte("clockIn", from.toISOString()).lt("clockIn", to.toISOString()).not("clockOut", "is", null),
    sb.from("Break").select("userId, startedAt, endedAt").gte("startedAt", from.toISOString()).lt("startedAt", to.toISOString()),
    sb.from("Checkin").select("userId, at, latitude, longitude").gte("at", from.toISOString()).lt("at", to.toISOString()),
    getRules(),
  ]);
  const users = must(ur, "team") as Person[];
  const shifts = must(sr, "shifts") as (Worked & { userId: string })[];
  const jobs = must(jr, "time entries") as (Worked & { userId: string })[];
  const breaks = must(br, "breaks") as (BreakRow & { userId: string })[];
  const checkins = must(cr, "check-ins") as { userId: string; at: string; latitude: number | null; longitude: number | null }[];
  const people: PayInput[] = users.map((u) => ({
    user: u,
    shifts: shifts.filter((s) => s.userId === u.id),
    jobs: jobs.filter((j) => j.userId === u.id),
    breaks: breaks.filter((b) => b.userId === u.id),
    points: checkins.filter((c) => c.userId === u.id).map((c) => ({ at: c.at, lat: c.latitude, lng: c.longitude })),
  })).filter((p) => p.shifts.length || p.jobs.length);
  return computePay(people, rules, approvedOnly);
}

/** Pure pay maths (unit-tested). */
export function computePay(people: PayInput[], rules: Rules, approvedOnly: boolean): PayrollRow[] {
  return people.map((p) => {
    const spans = paidSpans(p, rules, { approvedOnly });
    const { regular, overtime } = splitOvertime(spans);
    const rate = Number(p.user.hourlyRate);
    const all = [...p.shifts, ...p.jobs];
    const miles = totalMiles(p.points ?? []);
    return {
      userId: p.user.id, name: p.user.name, email: p.user.email, waveEmployeeId: p.user.waveEmployeeId, rate,
      regular, overtime, gross: Math.round((regular * rate + overtime * rate * 1.5) * 100) / 100,
      entries: all.length, unapproved: all.filter((w) => !w.approved).length,
      miles, mileagePay: Math.round(miles * rules.mileageRate * 100) / 100,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

type Entry = TimeEntry & { user: Pick<Profile, "name" | "email" | "waveEmployeeId" | "hourlyRate"> };
/** Job-time-only payroll (kept for the original tests): each entry is job time, no shifts or breaks. */
export function computePayroll(entries: Entry[], approvedOnly: boolean): PayrollRow[] {
  const by = new Map<string, PayInput>();
  for (const e of entries) {
    const p = by.get(e.userId) ?? { user: { id: e.userId, ...e.user }, shifts: [], jobs: [], breaks: [] };
    p.jobs.push(e);
    by.set(e.userId, p);
  }
  return computePay([...by.values()], { paidDriveTime: false, paidBreaks: false, breakAfterHours: 0, overtimeHours: 40, lateMinutes: 15, lateAlertTo: "both", mileageRate: 0 }, approvedOnly);
}
