import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { payrollFor } from "@/lib/payroll";
import { fromLocalInput } from "@/lib/format";

const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * CSV export for Wave Payroll. Wave Payroll has no public API, so this produces a per-employee
 * hours sheet (regular/overtime) to enter on Wave's "Run payroll" screen, plus a gross check column.
 */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || !me.active || me.role !== "OWNER") return new NextResponse("Only the owner can export payroll.", { status: 403 });
  const url = new URL(req.url);
  const f = url.searchParams.get("from") ?? "", t = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return new NextResponse("Pick a pay period (from and to dates).", { status: 400 });
  const from = fromLocalInput(`${f}T00:00`);
  const to = fromLocalInput(`${new Date(Date.parse(t + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10)}T00:00`);
  const rows = await payrollFor(from, to, url.searchParams.get("all") !== "1");
  const header = ["Employee Name", "Email", "Wave Employee ID", "Pay Period Start", "Pay Period End", "Regular Hours", "Overtime Hours", "Hourly Rate", "Gross Pay (est.)", "Miles", "Mileage Pay"];
  const end = url.searchParams.get("to");
  const body = rows.map((r) => [r.name, r.email, r.waveEmployeeId, url.searchParams.get("from"), end, r.regular.toFixed(2), r.overtime.toFixed(2), r.rate.toFixed(2), r.gross.toFixed(2), r.miles.toFixed(1), r.mileagePay.toFixed(2)].map(esc).join(","));
  return new NextResponse([header.join(","), ...body].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="wave-payroll-${url.searchParams.get("from")}_to_${end}.csv"` },
  });
}
