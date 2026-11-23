import { describe, expect, it } from "vitest";
import { distanceM, fenceCheck } from "@/lib/geo";
import { canManage, assignableRoles } from "@/lib/team";
import { appliesTo, normalizeTasks } from "@/lib/tasks";
import { fromLocalInput, isoDay, lineTotal, localDate } from "@/lib/format";

describe("geofence", () => {
  const site = { latitude: 38.9192, longitude: -94.6266, geofenceM: 150 };
  it("measures distance in meters", () => {
    expect(Math.round(distanceM(38.9192, -94.6266, 38.9192, -94.6266))).toBe(0);
    expect(Math.round(distanceM(38.9192, -94.6266, 38.9282, -94.6266) / 10) * 10).toBe(1000);
  });
  it("passes a check-in inside the fence", () => {
    expect(fenceCheck({ lat: 38.9193, lng: -94.6267, acc: 10 }, site).withinFence).toBe(true);
  });
  it("flags a check-in 1 km away", () => {
    const r = fenceCheck({ lat: 38.9282, lng: -94.6266, acc: 10 }, site);
    expect(r.withinFence).toBe(false);
    expect(r.distanceM).toBeGreaterThan(900);
  });
  it("gives the benefit of GPS accuracy (capped at 100 m)", () => {
    expect(fenceCheck({ lat: 38.9210, lng: -94.6266, acc: 80 }, site).withinFence).toBe(true); // ~200 m, ±80 m
    expect(fenceCheck({ lat: 38.9230, lng: -94.6266, acc: 500 }, site).withinFence).toBe(false); // ~420 m
  });
  it("records no verdict without GPS or site coordinates", () => {
    expect(fenceCheck({ lat: null, lng: null }, site).withinFence).toBeNull();
    expect(fenceCheck({ lat: 1, lng: 1 }, { latitude: null, longitude: null, geofenceM: 150 }).withinFence).toBeNull();
  });
});

describe("team permissions", () => {
  const owner = { id: "o", role: "OWNER" as const }, mgr = { id: "m", role: "MANAGER" as const }, staff = { id: "s", role: "STAFF" as const };
  it("owners manage everyone", () => {
    expect(canManage(owner, mgr)).toBe(true);
    expect(canManage(owner, { id: "o2", role: "OWNER" })).toBe(true);
  });
  it("managers manage staff only, never themselves", () => {
    expect(canManage(mgr, staff)).toBe(true);
    expect(canManage(mgr, { id: "m2", role: "MANAGER" })).toBe(false);
    expect(canManage(mgr, owner)).toBe(false);
    expect(canManage(mgr, mgr)).toBe(false);
  });
  it("staff manage no one", () => expect(canManage(staff, { id: "s2", role: "STAFF" })).toBe(false));
  it("managers can only grant Staff", () => {
    expect(assignableRoles(mgr)).toEqual(["STAFF"]);
    expect(assignableRoles(owner)).toContain("OWNER");
  });
});

describe("room tasks", () => {
  it("shows every-visit tasks on any service", () => expect(appliesTo({ serviceTypeIds: [] }, "svc_deep")).toBe(true));
  it("shows a deep-clean-only task only on deep cleans", () => {
    expect(appliesTo({ serviceTypeIds: ["svc_deep"] }, "svc_deep")).toBe(true);
    expect(appliesTo({ serviceTypeIds: ["svc_deep"] }, "svc_standard")).toBe(false);
  });
  it("reads old string tasks and drops blanks", () => {
    expect(normalizeTasks(["Dust piano", { label: " ", serviceTypeIds: [], minutes: null }])).toEqual([{ label: "Dust piano", serviceTypeIds: [], minutes: null }]);
  });
});

describe("dates and money", () => {
  it("reads typed times as Chicago wall-clock time", () => {
    expect(fromLocalInput("2026-11-19T18:30").toISOString()).toBe("2026-11-20T00:30:00.000Z"); // CST
    expect(fromLocalInput("2026-07-01T09:00").toISOString()).toBe("2026-07-01T14:00:00.000Z"); // CDT
  });
  it("gives the Chicago date of an instant", () => {
    expect(localDate("2026-11-20T03:00:00Z")).toBe("2026-11-19");
    expect(isoDay("2026-11-19")).toBe("2026-11-19");
  });
  it("totals invoice lines to the cent", () => {
    expect(lineTotal([{ description: "a", quantity: 3, unitPrice: 185.1 }, { description: "b", quantity: 1, unitPrice: 0.2 }])).toBe(555.5);
  });
});
