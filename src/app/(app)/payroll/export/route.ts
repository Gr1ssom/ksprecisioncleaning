import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { payrollFor } from "@/lib/payroll";

const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * CSV export for Wave Payroll. Wave Payroll has no public API, so this produces a per-employee
 * hours sheet (regular/overtime) to enter on Wave's "Run payroll" screen, plus a gross check column.
 */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || !me.active || me.role !== "OWNER") return new NextResponse("Only the owner can export payroll.", { status: 403 });
  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") + "T00:00:00Z");
  const to = new Date(new Date(url.searchParams.get("to") + "T00:00:00Z").getTime() + 86400_000);
  const rows = await payrollFor(from, to, url.searchParams.get("all") !== "1");
  const header = ["Employee Name", "Email", "Wave Employee ID", "Pay Period Start", "Pay Period End", "Regular Hours", "Overtime Hours", "Hourly Rate", "Gross Pay (est.)"];
  const end = url.searchParams.get("to");
  const body = rows.map((r) => [r.name, r.email, r.waveEmployeeId, url.searchParams.get("from"), end, r.regular.toFixed(2), r.overtime.toFixed(2), r.rate.toFixed(2), r.gross.toFixed(2)].map(esc).join(","));
  return new NextResponse([header.join(","), ...body].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="wave-payroll-${url.searchParams.get("from")}_to_${end}.csv"` },
  });
}
