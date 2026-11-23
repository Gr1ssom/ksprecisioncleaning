import { describe, expect, it } from "vitest";
import { itemActive, navFor, pagesFor, tabsFor } from "../src/lib/nav";

const hrefs = (role: "STAFF" | "MANAGER" | "OWNER") => pagesFor(navFor(role)).map((p) => p.href);

describe("navigation", () => {
  it("gives the owner nine sidebar entries that still reach every page", () => {
    expect(navFor("OWNER").map((i) => i.label)).toEqual(["Dashboard", "Check in", "Jobs", "Clients", "Hours", "Invoices", "Inventory", "Team", "More"]);
    expect(hrefs("OWNER").sort()).toEqual(["/account", "/activity", "/checkin", "/clients", "/dashboard", "/inventory", "/invoices", "/issues", "/jobs", "/locations", "/payroll", "/reports", "/settings", "/sops", "/team", "/time"]);
  });
  it("never links a role to a page above it", () => {
    expect(hrefs("MANAGER")).not.toContain("/payroll");
    expect(hrefs("MANAGER")).not.toContain("/activity");
    for (const h of ["/clients", "/invoices", "/inventory", "/team", "/settings", "/reports", "/payroll", "/activity"]) expect(hrefs("STAFF")).not.toContain(h);
    expect(hrefs("STAFF")).toEqual(["/dashboard", "/checkin", "/jobs", "/locations", "/sops", "/issues", "/time", "/account"]);
  });
  it("shows section tabs only where there is more than one page to switch between", () => {
    expect(tabsFor("OWNER", "/locations/abc").map((t) => t.label)).toEqual(["Clients", "Locations", "SOPs"]);
    expect(tabsFor("OWNER", "/payroll").map((t) => t.label)).toEqual(["Hours", "Payroll"]);
    expect(tabsFor("MANAGER", "/time")).toEqual([]); // managers have no Payroll tab
    expect(tabsFor("MANAGER", "/issues").map((t) => t.label)).toEqual(["Reports", "Issues", "Settings", "My account"]);
    expect(tabsFor("STAFF", "/sops")).toEqual([]);
    expect(tabsFor("OWNER", "/jobs")).toEqual([]);
  });
  it("highlights the section for any page inside it", () => {
    const more = navFor("OWNER").find((i) => i.label === "More")!;
    expect(itemActive("/settings", more)).toBe(true);
    expect(itemActive("/jobs", more)).toBe(false);
  });
});
