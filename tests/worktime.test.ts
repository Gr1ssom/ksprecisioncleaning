import { describe, expect, it } from "vitest";
import { clashes, hoursOf, jobHours, mileageByDay, paidSpans, splitOvertime, subtract, union, weekdayOf } from "@/lib/worktime";
import { computePay } from "@/lib/payroll";
import { DEFAULT_RULES } from "@/lib/worktime";

const at = (iso: string, h = 0) => new Date(Date.parse(iso) + h * 3600_000).toISOString();
const w = (start: string, hours: number, approved = true) => ({ clockIn: start, clockOut: at(start, hours), approved });

describe("spans", () => {
  it("merges overlaps and removes cuts", () => {
    expect(union([{ start: 0, end: 5 }, { start: 3, end: 8 }, { start: 10, end: 12 }])).toEqual([{ start: 0, end: 8 }, { start: 10, end: 12 }]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 2, end: 4 }])).toEqual([{ start: 0, end: 2 }, { start: 4, end: 10 }]);
  });
});

describe("paid time", () => {
  // Shift 8:00–16:00 UTC, job 9:00–12:00 inside it, 30-min break at 12:00.
  const day = { shifts: [w("2026-11-17T08:00:00Z", 8)], jobs: [w("2026-11-17T09:00:00Z", 3)], breaks: [{ startedAt: "2026-11-17T12:00:00Z", endedAt: "2026-11-17T12:30:00Z" }] };
  it("pays the whole shift minus an unpaid break (drive time paid)", () => {
    expect(hoursOf(paidSpans(day, { paidDriveTime: true, paidBreaks: false }))).toBe(7.5);
  });
  it("pays the break when breaks are paid", () => {
    expect(hoursOf(paidSpans(day, { paidDriveTime: true, paidBreaks: true }))).toBe(8);
  });
  it("pays only job time when drive time isn't paid", () => {
    expect(hoursOf(paidSpans(day, { paidDriveTime: false, paidBreaks: false }))).toBe(3);
  });
  it("counts job time outside a shift (forgot to start the day) and never double-counts", () => {
    const d = { shifts: [w("2026-11-17T10:00:00Z", 4)], jobs: [w("2026-11-17T09:00:00Z", 3)], breaks: [] };
    expect(hoursOf(paidSpans(d, { paidDriveTime: true, paidBreaks: false }))).toBe(5);
  });
  it("leaves out open entries unless a 'now' is given", () => {
    const d = { shifts: [{ clockIn: "2026-11-17T08:00:00Z", clockOut: null, approved: false }], jobs: [], breaks: [] };
    expect(hoursOf(paidSpans(d, DEFAULT_RULES))).toBe(0);
    expect(hoursOf(paidSpans(d, DEFAULT_RULES, { now: Date.parse("2026-11-17T10:00:00Z") }))).toBe(2);
  });
  it("skips unapproved shifts when paying approved time only", () => {
    const d = { shifts: [w("2026-11-17T08:00:00Z", 8, false)], jobs: [w("2026-11-17T09:00:00Z", 3)], breaks: [] };
    expect(hoursOf(paidSpans(d, DEFAULT_RULES, { approvedOnly: true }))).toBe(3);
  });
});

describe("overtime and pay", () => {
  it("splits over 40 in a Chicago pay week", () => {
    const spans = ["16", "17", "18", "19", "20"].map((d) => ({ start: Date.parse(`2026-11-${d}T14:00:00Z`), end: Date.parse(`2026-11-${d}T23:00:00Z`) }));
    expect(splitOvertime(spans)).toEqual({ regular: 40, overtime: 5 });
  });
  it("computes gross and mileage", () => {
    const user = { id: "u1", name: "Ana", email: "a@x", waveEmployeeId: null, hourlyRate: 20 };
    const points = [
      { at: "2026-11-17T14:00:00Z", lat: 38.627, lng: -90.199 }, // St. Louis
      { at: "2026-11-17T15:00:00Z", lat: 38.627, lng: -90.180 }, // ~1 mile east
    ];
    const [r] = computePay([{ user, shifts: [w("2026-11-17T14:00:00Z", 8)], jobs: [], breaks: [], points }], DEFAULT_RULES, true);
    expect(r.regular).toBe(8);
    expect(r.gross).toBe(160);
    expect(r.miles).toBeCloseTo(1, 0);
    expect(r.mileagePay).toBeCloseTo(0.7, 1);
  });
});

describe("mileage", () => {
  it("ignores GPS drift at one site and hops across midnight", () => {
    const m = mileageByDay([
      { at: "2026-11-17T14:00:00Z", lat: 38.6270, lng: -90.1990 },
      { at: "2026-11-17T16:00:00Z", lat: 38.6271, lng: -90.1991 },
      { at: "2026-11-17T17:00:00Z", lat: null, lng: null },
    ]);
    expect([...m.values()]).toEqual([]);
  });
});

describe("schedule clashes", () => {
  const job = { id: "j1", date: "2026-11-24", startTime: "09:00", endTime: "12:00" }; // a Tuesday
  const base = { name: "Ana Torres", timeOff: [], availability: [], otherJobs: [], weekHours: 10, overtimeHours: 40 };
  it("knows weekdays (0 = Monday)", () => expect(weekdayOf("2026-11-24")).toBe(1));
  it("finds no problems on a clear day", () => expect(clashes(job, base)).toEqual([]));
  it("flags time off, availability, overlaps and overtime", () => {
    expect(clashes(job, { ...base, timeOff: [{ startDate: "2026-11-23", endDate: "2026-11-25", status: "APPROVED" }] })[0]).toMatch(/approved time off/);
    expect(clashes(job, { ...base, timeOff: [{ startDate: "2026-11-24", endDate: "2026-11-24", status: "DENIED" }] })).toEqual([]);
    expect(clashes(job, { ...base, availability: [{ weekday: 1, available: false, startTime: null, endTime: null }] })[0]).toMatch(/Tuesdays/);
    expect(clashes(job, { ...base, availability: [{ weekday: 1, available: true, startTime: "10:00", endTime: "17:00" }] })[0]).toMatch(/only available 10:00–17:00/);
    expect(clashes(job, { ...base, otherJobs: [{ id: "j2", date: "2026-11-24", startTime: "11:00", endTime: "13:00" }] })[0]).toMatch(/overlaps/);
    expect(clashes(job, { ...base, weekHours: 38 })[0]).toMatch(/about 41 h/);
  });
  it("treats a job without an end time as 3 hours", () => expect(jobHours({ date: "2026-11-24", startTime: "09:00", endTime: null })).toBe(3));
});
