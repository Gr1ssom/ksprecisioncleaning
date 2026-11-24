import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { payrollFor } from "@/lib/payroll";
import { fromLocalInput, isoDay, money, todayUTC } from "@/lib/format";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Payroll({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; all?: string }> }) {
  await requireUser("OWNER");
  const sp = await searchParams;
  // Default: the last full two-week period ending last Sunday.
  const t = todayUTC();
  const lastSunday = new Date(t.getTime() - (t.getUTCDay() || 7) * 86400_000);
  const from = sp.from ?? isoDay(new Date(lastSunday.getTime() - 13 * 86400_000));
  const to = sp.to ?? isoDay(lastSunday);
  const all = sp.all === "1";
  // Days run midnight to midnight Chicago time.
  const end = isoDay(new Date(Date.parse(to + "T00:00:00Z") + 86400_000));
  const [rows, rules] = await Promise.all([payrollFor(fromLocalInput(`${from}T00:00`), fromLocalInput(`${end}T00:00`), !all), getRules()]);
  const miles = rows.reduce((s, r) => s + r.miles, 0);
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  const unapproved = rows.reduce((s, r) => s + r.unapproved, 0);
  const qs = new URLSearchParams({ from, to, ...(all ? { all: "1" } : {}) }).toString();

  return (
    <>
      <PageHeader title="Payroll" subtitle={`Hours from the shift clock and check-ins (${rules.paidDriveTime ? "whole days" : "job time only"}, breaks ${rules.paidBreaks ? "paid" : "unpaid"}), ready for Wave Payroll.`}
        action={<a href={`/payroll/export?${qs}`} className="btn-primary">Download CSV</a>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div><label className="label">From</label><input type="date" name="from" defaultValue={from} className="input" /></div>
        <div><label className="label">To</label><input type="date" name="to" defaultValue={to} className="input" /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="all" value="1" defaultChecked={all} /> Include unapproved</label>
        <button className="btn-secondary">Update</button>
      </form>
      {unapproved > 0 && !all && <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{unapproved} entries in this period aren&apos;t approved and are left out. Approve them under Hours first.</div>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Employees" value={rows.length} />
        <Stat label="Total hours" value={rows.reduce((s, r) => s + r.regular + r.overtime, 0).toFixed(2)} />
        <Stat label="Estimated gross" value={money(gross)} tone="blue" />
        <Stat label="Mileage" value={`${miles.toFixed(1)} mi`} hint={rules.mileageRate ? `${money(rows.reduce((s, r) => s + r.mileagePay, 0))} at ${money(rules.mileageRate)}/mi` : "between check-ins"} />
      </div>
      {rows.length === 0 ? <Empty>No completed time entries in this period.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Wave ID</th><th className="text-right">Regular</th><th className="text-right">Overtime</th><th className="text-right">Rate</th><th className="text-right">Gross (est.)</th><th className="text-right">Miles</th>{rules.mileageRate > 0 && <th className="text-right">Mileage pay</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className="font-medium">{r.name}<div className="text-xs text-slate-500">{r.email}</div></td>
                  <td>{r.waveEmployeeId ?? <span className="text-xs text-amber-600">not set</span>}</td>
                  <td className="text-right tabular-nums">{r.regular.toFixed(2)}</td>
                  <td className="text-right tabular-nums">{r.overtime.toFixed(2)}</td>
                  <td className="text-right tabular-nums">{money(r.rate)}</td>
                  <td className="text-right font-semibold tabular-nums">{money(r.gross)}</td>
                  <td className="text-right tabular-nums">{r.miles.toFixed(1)}</td>
                  {rules.mileageRate > 0 && <td className="text-right tabular-nums">{money(r.mileagePay)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card mt-5 text-sm text-slate-600">
        <div className="mb-1 font-semibold text-slate-800">Getting this into Wave</div>
        Wave Payroll doesn&apos;t offer an API for hours, so the app gives you a ready-to-enter sheet. In Wave: <b>Payroll → Run payroll</b>, pick this pay period, then enter each person&apos;s regular and overtime hours from the CSV. Overtime is any time over 40 hours in a Monday–Sunday week, at 1.5×. Wave calculates taxes and deductions itself. Mileage is the straight-line distance between each person&apos;s check-ins in a day (pickups and job sites), so real driving is usually a bit longer; add it in Wave as a reimbursement if you pay it.
      </div>
    </>
  );
}
