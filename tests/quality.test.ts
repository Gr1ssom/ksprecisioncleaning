import { describe, expect, it } from "vitest";
import { inspectionScore, isLowRating, qualityByKey, ratingPoints } from "@/lib/quality";
import { billingWindow, invoiceLines, wavePaid } from "@/lib/billing";
import { jobDefaults, parseTemplate } from "@/lib/templates";

describe("inspection score", () => {
  it("is null with no rooms", () => expect(inspectionScore([])).toBeNull());
  it("averages room points (pass 100, touch-up 60, fail 0)", () => {
    expect(inspectionScore(["PASS", "PASS"])).toBe(100);
    expect(inspectionScore(["PASS", "TOUCH_UP", "FAIL"])).toBe(53.3);
  });
});

describe("client ratings", () => {
  it("maps 1–5 onto 0–100", () => {
    expect(ratingPoints(5)).toBe(100);
    expect(ratingPoints(1)).toBe(0);
    expect(ratingPoints(3)).toBe(50);
  });
  it("treats 1 and 2 as low", () => {
    expect(isLowRating(2)).toBe(true);
    expect(isLowRating(3)).toBe(false);
  });
});

describe("quality roll-up", () => {
  const q = qualityByKey(
    [{ key: "ana", result: "PASS" }, { key: "ana", result: "FAIL" }, { key: "ben", result: "TOUCH_UP" }, { key: null, result: "PASS" }],
    [{ key: "ana", rating: 5 }, { key: "cy", rating: 2 }],
  );
  it("counts rooms and first-time passes per person", () => {
    const ana = q.get("ana")!;
    expect(ana.rooms).toBe(2);
    expect(ana.passRate).toBe(0.5);
    expect(ana.inspectionScore).toBe(50);
    expect(ana.avgRating).toBe(5);
    // (100 + 0 + 100) / 3 items
    expect(ana.score).toBe(67);
  });
  it("works with only ratings or only inspections", () => {
    expect(q.get("cy")!.passRate).toBeNull();
    expect(q.get("cy")!.score).toBe(25);
    expect(q.get("ben")!.avgRating).toBeNull();
    expect(q.get("ben")!.score).toBe(60);
  });
  it("ignores rows without a key", () => expect(q.size).toBe(3));
});

describe("invoice lines", () => {
  const v = (id: string, date: string, svc: string | null, loc = "l1") => ({
    id, date, locationId: loc, serviceTypeId: svc, location: { name: loc === "l1" ? "HQ" : "Annex" }, serviceType: svc ? { name: svc === "std" ? "Standard clean" : "Deep clean" } : null,
  });
  const price = (s: string | null) => (s === "std" ? 150 : s === "deep" ? 300 : null);
  it("groups by location and service, one line each, dates in order", () => {
    const r = invoiceLines([v("b", "2026-10-09", "std"), v("a", "2026-10-02", "std"), v("c", "2026-10-05", "deep")], price);
    expect(r.lines).toEqual([
      { description: "Standard clean – HQ (Oct 2, Oct 9)", quantity: 2, unitPrice: 150 },
      { description: "Deep clean – HQ (Oct 5)", quantity: 1, unitPrice: 300 },
    ]);
    expect(r.priced.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
  it("keeps unpriced visits out (never billed at $0)", () => {
    const r = invoiceLines([v("a", "2026-10-02", null), v("b", "2026-10-03", "std")], price);
    expect(r.unpriced.map((x) => x.id)).toEqual(["a"]);
    expect(r.lines).toHaveLength(1);
  });
});

describe("monthly billing window", () => {
  it("on Nov 1 bills visits before Nov 1, labelled October", () => {
    expect(billingWindow("2026-11-01")).toEqual({ month: "2026-11-01", before: "2026-11-01", label: "October 2026" });
  });
  it("in January labels December of the year before", () => {
    expect(billingWindow("2027-01-15").label).toBe("December 2026");
  });
  it("treats Wave PAID and OVERPAID as paid", () => {
    expect(wavePaid("PAID")).toBe(true);
    expect(wavePaid("OVERPAID")).toBe(true);
    expect(wavePaid("PARTIAL")).toBe(false);
    expect(wavePaid(null)).toBe(false);
  });
});

describe("job templates", () => {
  it("ignores empty or junk templates", () => {
    expect(parseTemplate(null)).toBeNull();
    expect(parseTemplate({ tasks: [], startTime: "6pm" })).toBeNull();
  });
  it("keeps valid fields and fills the form", () => {
    const t = parseTemplate({ serviceTypeId: "deep", startTime: "07:30", endTime: "bad", tasks: [" Lobby glass ", "", 3], userId: "" });
    expect(t).toEqual({ serviceTypeId: "deep", startTime: "07:30", endTime: null, userId: null, tasks: ["Lobby glass"], notes: null });
    expect(jobDefaults(t, "std")).toMatchObject({ serviceTypeId: "deep", startTime: "07:30", endTime: "", tasks: "Lobby glass" });
    expect(jobDefaults(null, "std")).toMatchObject({ serviceTypeId: "std", startTime: "18:00" });
  });
});
