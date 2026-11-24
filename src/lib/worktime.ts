// Pure time and pay rules (no database): paid time from shifts, job time and breaks; overtime
// projection; schedule clashes; mileage. Unit-tested in tests/worktime.test.ts.
import { distanceM } from "./geo";
import { fromLocalInput, localDate, payWeek } from "./format";

/** Owner settings (Settings page). Stored in the "Setting" table; these are the defaults. */
export type Rules = {
  /** Pay the whole shift (drive time and supply runs count), or only time checked in at jobs. */
  paidDriveTime: boolean;
  paidBreaks: boolean;
  /** Remind someone to take a break after this many hours on the clock (0 = off). */
  breakAfterHours: number;
  /** Warn before a person's week passes this many hours. */
  overtimeHours: number;
  /** Minutes after a job's start before the "not checked in" alert goes out. */
  lateMinutes: number;
  lateAlertTo: "managers" | "owners" | "both";
  /** Mileage reimbursement in dollars per mile (0 = don't show money, only miles). */
  mileageRate: number;
};
export const DEFAULT_RULES: Rules = {
  paidDriveTime: true, paidBreaks: false, breakAfterHours: 0, overtimeHours: 40, lateMinutes: 15, lateAlertTo: "both", mileageRate: 0.7,
};

export type Span = { start: number; end: number };
export type Worked = { clockIn: string; clockOut: string | null; approved: boolean };
export type BreakRow = { startedAt: string; endedAt: string | null };

const t = (iso: string) => Date.parse(iso);
const H = 3_600_000;

/** Merge overlapping spans. */
export function union(spans: Span[]): Span[] {
  const s = spans.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

/** Remove `cuts` from `spans`. */
export function subtract(spans: Span[], cuts: Span[]): Span[] {
  let cur = union(spans);
  for (const c of union(cuts)) {
    cur = cur.flatMap((s) => {
      if (c.end <= s.start || c.start >= s.end) return [s];
      const parts: Span[] = [];
      if (c.start > s.start) parts.push({ start: s.start, end: c.start });
      if (c.end < s.end) parts.push({ start: c.end, end: s.end });
      return parts;
    });
  }
  return cur;
}

const spanOf = (w: Worked, now?: number): Span | null => {
  const end = w.clockOut ? t(w.clockOut) : now;
  return end == null ? null : { start: t(w.clockIn), end };
};

/**
 * One person's paid time. With paid drive time, the whole shift counts (plus any job time outside
 * a shift, e.g. they forgot to start their day); otherwise only job time. Unpaid breaks come off.
 * Open entries count only when `now` is given (live totals); payroll leaves them out.
 */
export function paidSpans(
  p: { shifts: Worked[]; jobs: Worked[]; breaks: BreakRow[] },
  rules: Pick<Rules, "paidDriveTime" | "paidBreaks">,
  opts: { approvedOnly?: boolean; now?: number } = {},
): Span[] {
  const keep = (w: Worked) => !opts.approvedOnly || w.approved;
  const src = [...(rules.paidDriveTime ? p.shifts : []), ...p.jobs].filter(keep);
  const spans = src.map((w) => spanOf(w, opts.now)).filter((x): x is Span => !!x);
  if (rules.paidBreaks) return union(spans);
  const cuts = p.breaks.map((b) => ({ start: t(b.startedAt), end: b.endedAt ? t(b.endedAt) : (opts.now ?? t(b.startedAt)) }));
  return subtract(spans, cuts);
}

export const hoursOf = (spans: Span[]) => spans.reduce((s, x) => s + (x.end - x.start) / H, 0);

/** Hours per pay week (Mon–Sun, Chicago), keyed by the week's Monday. A span counts in the week it starts. */
export function hoursByWeek(spans: Span[]) {
  const m = new Map<string, number>();
  for (const s of spans) {
    const wk = payWeek(new Date(s.start));
    m.set(wk, (m.get(wk) ?? 0) + (s.end - s.start) / H);
  }
  return m;
}

/** Regular and overtime hours (over 40 per pay week). */
export function splitOvertime(spans: Span[], limit = 40) {
  let regular = 0, overtime = 0;
  for (const h of hoursByWeek(spans).values()) { regular += Math.min(h, limit); overtime += Math.max(0, h - limit); }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { regular: r2(regular), overtime: r2(overtime) };
}

export type Sched = { id?: string; date: string; startTime: string; endTime: string | null };
/** Scheduled length of a job in hours (3 h if no end time is set). */
export function jobHours(j: Sched) {
  if (!j.endTime) return 3;
  const [sh, sm] = j.startTime.split(":").map(Number);
  const [eh, em] = j.endTime.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 3;
}
/** Job start/end as instants (Chicago wall clock). */
export function jobSpan(j: Sched): Span {
  const start = fromLocalInput(`${j.date}T${j.startTime}`).getTime();
  return { start, end: start + jobHours(j) * H };
}

export type Availability = { weekday: number; available: boolean; startTime: string | null; endTime: string | null };
export type TimeOffRow = { startDate: string; endDate: string; status: string };

/** 0 = Monday … 6 = Sunday, for a "YYYY-MM-DD" date. */
export const weekdayOf = (date: string) => (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;

/**
 * Problems with giving `job` to a person: time off, outside their available hours, overlapping
 * another of their jobs, or pushing their week past the overtime limit. Plain sentences.
 */
export function clashes(job: Sched, p: {
  name: string; timeOff: TimeOffRow[]; availability: Availability[]; otherJobs: Sched[]; weekHours: number; overtimeHours: number;
}): string[] {
  const out: string[] = [];
  const first = p.name.split(" ")[0];
  const off = p.timeOff.find((o) => o.status !== "DENIED" && o.status !== "CANCELLED" && o.startDate <= job.date && job.date <= o.endDate);
  if (off) out.push(off.status === "APPROVED" ? `${first} has approved time off that day.` : `${first} has asked for that day off (not decided yet).`);
  const av = p.availability.find((a) => a.weekday === weekdayOf(job.date));
  if (av && !av.available) out.push(`${first} isn't available on ${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][av.weekday]}.`);
  else if (av && av.startTime && av.endTime) {
    const end = job.endTime ?? addHours(job.startTime, jobHours(job));
    if (job.startTime < av.startTime || end > av.endTime) out.push(`${first} is only available ${av.startTime}–${av.endTime} that day.`);
  }
  const mine = jobSpan(job);
  const overlap = p.otherJobs.find((o) => o.id !== job.id && o.date === job.date && (() => { const s = jobSpan(o); return s.start < mine.end && mine.start < s.end; })());
  if (overlap) out.push(`${first} already has a job at ${overlap.startTime} that overlaps.`);
  const projected = p.weekHours + jobHours(job);
  if (projected > p.overtimeHours) out.push(`${first} would reach about ${Math.round(projected)} h that week (overtime after ${p.overtimeHours}).`);
  return out;
}
const addHours = (hhmm: string, h: number) => {
  const [a, b] = hhmm.split(":").map(Number);
  const m = Math.min(a * 60 + b + Math.round(h * 60), 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export type Point = { at: string; lat: number | null; lng: number | null };
/**
 * Straight-line miles between a person's consecutive check-in points, per Chicago day. Hops under
 * 0.1 mile (same site, GPS drift) don't count. Points without GPS are skipped.
 */
export function mileageByDay(points: Point[]) {
  const byDay = new Map<string, number>();
  const pts = points.filter((p) => p.lat != null && p.lng != null).sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const day = localDate(b.at);
    if (localDate(a.at) !== day) continue;
    const mi = distanceM(a.lat!, a.lng!, b.lat!, b.lng!) / 1609.344;
    if (mi >= 0.1) byDay.set(day, (byDay.get(day) ?? 0) + mi);
  }
  return byDay;
}
export const totalMiles = (points: Point[]) => Math.round([...mileageByDay(points).values()].reduce((s, v) => s + v, 0) * 10) / 10;
