import "server-only";
import { admin, must } from "./supabase/server";
import { getRules } from "./settings";
import { fromLocalInput, payWeek } from "./format";
import { clashes, hoursOf, jobHours, paidSpans, type Availability, type Sched, type TimeOffRow, type Worked, type BreakRow } from "./worktime";
import type { Break, Shift } from "./types";

const addDays = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * 86400_000).toISOString().slice(0, 10);

/** The Mon–Sun pay week (Chicago) containing a date or instant: first/last dates and instants. */
export function weekOf(when: Date | string = new Date()) {
  const monday = payWeek(typeof when === "string" && when.length === 10 ? when + "T18:00:00Z" : when);
  return { monday, sunday: addDays(monday, 6), from: fromLocalInput(`${monday}T00:00`), to: fromLocalInput(`${addDays(monday, 7)}T00:00`) };
}

/** Someone's open shift and break right now (the shift clock card). */
export async function clockState(userId: string) {
  const sb = admin();
  const [s, b] = await Promise.all([
    sb.from("Shift").select("*").eq("userId", userId).is("clockOut", null).maybeSingle(),
    sb.from("Break").select("*").eq("userId", userId).is("endedAt", null).maybeSingle(),
  ]);
  return { shift: must(s, "shift") as Shift | null, onBreak: must(b, "break") as Break | null };
}

/** Paid hours per person in a pay week so far (open shifts count up to now). */
export async function weekHours(userIds: string[], when: Date | string = new Date()) {
  if (!userIds.length) return {} as Record<string, number>;
  const { from, to } = weekOf(when);
  const sb = admin();
  const [sr, jr, br, rules] = await Promise.all([
    sb.from("Shift").select("userId, clockIn, clockOut, approved").in("userId", userIds).gte("clockIn", from.toISOString()).lt("clockIn", to.toISOString()),
    sb.from("TimeEntry").select("userId, clockIn, clockOut, approved").in("userId", userIds).gte("clockIn", from.toISOString()).lt("clockIn", to.toISOString()),
    sb.from("Break").select("userId, startedAt, endedAt").in("userId", userIds).gte("startedAt", from.toISOString()).lt("startedAt", to.toISOString()),
    getRules(),
  ]);
  type W = Worked & { userId: string };
  const shifts = must(sr, "shifts") as W[], jobs = must(jr, "time") as W[], breaks = must(br, "breaks") as (BreakRow & { userId: string })[];
  const now = Date.now();
  return Object.fromEntries(userIds.map((id) => [id, hoursOf(paidSpans({
    shifts: shifts.filter((x) => x.userId === id), jobs: jobs.filter((x) => x.userId === id), breaks: breaks.filter((x) => x.userId === id),
  }, rules, { now }))]));
}

/**
 * Hours a person will likely have that week: paid so far + the scheduled length of their jobs
 * still to come (not started yet), optionally leaving one job out.
 */
export async function projectedHours(userId: string, date: string, exceptJobId?: string) {
  const { monday, sunday } = weekOf(date);
  const [worked, upcoming] = await Promise.all([
    weekHours([userId], date),
    admin().from("Assignment").select("id, date, startTime, endTime").eq("userId", userId).gte("date", monday).lte("date", sunday).eq("status", "SCHEDULED"),
  ]);
  const jobs = (must(upcoming, "jobs") as Sched[]).filter((j) => j.id !== exceptJobId);
  return (worked[userId] ?? 0) + jobs.reduce((s, j) => s + jobHours(j), 0);
}

/** Warnings for giving a job to someone (time off, availability, overlap, overtime). */
export async function clashesFor(job: Sched & { id?: string }, userId: string) {
  const sb = admin();
  const [ur, tr, ar, jr, rules, projected] = await Promise.all([
    sb.from("User").select("name").eq("id", userId).single(),
    sb.from("TimeOff").select("startDate, endDate, status").eq("userId", userId).lte("startDate", job.date).gte("endDate", job.date),
    sb.from("Availability").select("weekday, available, startTime, endTime").eq("userId", userId),
    sb.from("Assignment").select("id, date, startTime, endTime").eq("userId", userId).eq("date", job.date).neq("status", "CANCELLED"),
    getRules(),
    projectedHours(userId, job.date, job.id),
  ]);
  const name = (must(ur, "person") as { name: string }).name;
  // Already-scheduled hours include this job if it's saved; projectedHours left it out, clashes adds it.
  return clashes(job, {
    name, timeOff: must(tr, "time off") as TimeOffRow[], availability: must(ar, "availability") as Availability[],
    otherJobs: (must(jr, "jobs") as Sched[]).filter((j) => j.id !== job.id), weekHours: projected, overtimeHours: rules.overtimeHours,
  });
}
