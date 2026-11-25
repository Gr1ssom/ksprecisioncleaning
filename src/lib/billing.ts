// Invoice lines and the monthly billing window. Pure (no server-only), unit-tested.
import { fmtDate, type Line } from "./format";

export type BillableVisit = {
  id: string; date: string; locationId: string; serviceTypeId: string | null;
  location: { name: string }; serviceType: { name: string } | null;
};

/**
 * One line per location + service type, priced from the client's rate for that service.
 * Returns the visits that have no price separately: they are never billed (never at $0).
 */
export function invoiceLines(visits: BillableVisit[], price: (serviceTypeId: string | null) => number | null) {
  const groups = new Map<string, { label: string; rate: number; dates: string[] }>();
  const priced: BillableVisit[] = [];
  const unpriced: BillableVisit[] = [];
  for (const v of [...visits].sort((a, b) => a.date.localeCompare(b.date))) {
    const rate = price(v.serviceTypeId);
    if (rate == null) { unpriced.push(v); continue; }
    priced.push(v);
    const key = `${v.locationId}|${v.serviceTypeId}`;
    const e = groups.get(key) ?? { label: `${v.serviceType?.name ?? "Clean"} – ${v.location.name}`, rate, dates: [] };
    e.dates.push(fmtDate(v.date).replace(/, \d{4}$/, ""));
    groups.set(key, e);
  }
  const lines: Line[] = [...groups.values()].map((e) => ({ description: `${e.label} (${e.dates.join(", ")})`, quantity: e.dates.length, unitPrice: e.rate }));
  return { lines, priced, unpriced };
}

/**
 * The monthly run for a Chicago business date: on any day of a month it bills visits dated before
 * that month's 1st (last month plus anything left over). `month` names the run ("2026-11-01").
 */
export function billingWindow(localDay: string) {
  const [y, m] = localDay.split("-").map(Number);
  const month = `${y}-${String(m).padStart(2, "0")}-01`;
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const label = prev.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month, before: month, label };
}

/** Wave invoice statuses that mean the money is in. */
export const wavePaid = (status: string | null | undefined) => status === "PAID" || status === "OVERPAID";
