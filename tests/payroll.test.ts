import { describe, expect, it } from "vitest";
import { computePayroll } from "@/lib/payroll";
import { payWeek } from "@/lib/format";

const user = { name: "Ana Torres", email: "ana@x", waveEmployeeId: null, hourlyRate: 20 };
let n = 0;
const entry = (clockIn: string, hours: number, approved = true) => ({
  id: `e${++n}`, userId: "u1", assignmentId: null, note: null, approved, user,
  clockIn, clockOut: new Date(Date.parse(clockIn) + hours * 3600_000).toISOString(),
});

describe("payWeek (Mon–Sun, Chicago time)", () => {
  it("keeps a Sunday-evening Chicago shift in the week that ends that Sunday", () => {
    // Sun 2026-11-22 8:00 PM CST = Mon 02:00 UTC — UTC would wrongly put it in the next week
    expect(payWeek("2026-11-23T02:00:00Z")).toBe("2026-11-16");
  });
  it("starts the week at Monday midnight Chicago", () => {
    expect(payWeek("2026-11-23T06:00:00Z")).toBe("2026-11-23"); // Mon 00:00 CST
    expect(payWeek("2026-11-23T05:59:00Z")).toBe("2026-11-16"); // Sun 11:59 PM CST
  });
  it("handles daylight time (CDT, UTC-5)", () => {
    expect(payWeek("2026-07-13T04:30:00Z")).toBe("2026-07-06"); // Sun 11:30 PM CDT
    expect(payWeek("2026-07-13T05:00:00Z")).toBe("2026-07-13"); // Mon 00:00 CDT
  });
});

describe("computePayroll", () => {
  it("pays hours over 40 in a week at 1.5x", () => {
    const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"].map((d) => entry(`${d}T14:00:00Z`, 9));
    const [r] = computePayroll(week, true);
    expect(r.regular).toBe(40);
    expect(r.overtime).toBe(5);
    expect(r.gross).toBe(40 * 20 + 5 * 30);
  });
  it("doesn't combine two weeks into overtime", () => {
    const rows = [entry("2026-11-20T14:00:00Z", 30), entry("2026-11-23T14:00:00Z", 30)];
    const [r] = computePayroll(rows, true);
    expect(r.overtime).toBe(0);
    expect(r.regular).toBe(60);
  });
  it("splits a Sunday-night shift into its own Chicago week", () => {
    // 38h earlier in the week + a 4h shift Sunday 8 PM CST (Monday UTC) = 42h → 2h overtime
    const rows = [entry("2026-11-17T14:00:00Z", 38), entry("2026-11-23T02:00:00Z", 4)];
    const [r] = computePayroll(rows, true);
    expect(r.overtime).toBe(2);
  });
  it("leaves unapproved hours out when asked, but counts them", () => {
    const [r] = computePayroll([entry("2026-11-17T14:00:00Z", 5), entry("2026-11-18T14:00:00Z", 3, false)], true);
    expect(r.regular).toBe(5);
    expect(r.unapproved).toBe(1);
    expect(r.entries).toBe(2);
  });
});
