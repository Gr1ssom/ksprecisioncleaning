import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { decideClaim, decideTimeOff } from "@/app/actions/requests";
import { fmtDate, fmtDateTime, today } from "@/lib/format";
import type { Assignment, AvailabilityRow, Profile, ShiftClaim, TimeOff } from "@/lib/types";

export const dynamic = "force-dynamic";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function Requests({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const sb = admin();
  const [tr, cr, ur, ar, jr] = await Promise.all([
    sb.from("TimeOff").select("*, user:User!TimeOff_userId_fkey(name)").gte("endDate", today()).in("status", ["PENDING", "APPROVED"]).order("startDate"),
    sb.from("ShiftClaim").select("*, user:User!ShiftClaim_userId_fkey(name), job:Assignment(id, date, startTime, endTime, location:Location(name))").eq("status", "PENDING").order("createdAt"),
    sb.from("User").select("id, name").eq("active", true).order("name"),
    sb.from("Availability").select("*"),
    sb.from("Assignment").select("id, date, userId").gte("date", today()).neq("status", "CANCELLED"),
  ]);
  const off = must(tr, "time off") as (TimeOff & { user: Pick<Profile, "name"> })[];
  const claims = must(cr, "shift requests") as (ShiftClaim & { user: Pick<Profile, "name">; job: Assignment & { location: { name: string } } })[];
  const team = must(ur, "team") as Pick<Profile, "id" | "name">[];
  const avail = must(ar, "availability") as AvailabilityRow[];
  const jobs = must(jr, "jobs") as Pick<Assignment, "id" | "date" | "userId">[];
  const pending = off.filter((o) => o.status === "PENDING"), approved = off.filter((o) => o.status === "APPROVED");
  const range = (o: TimeOff) => (o.startDate === o.endDate ? fmtDate(o.startDate) : `${fmtDate(o.startDate)} – ${fmtDate(o.endDate)}`);
  const jobsDuring = (o: TimeOff) => jobs.filter((j) => j.userId === o.userId && j.date >= o.startDate && j.date <= o.endDate).length;

  return (
    <>
      <PageHeader title="Requests" subtitle="Time off and open shifts waiting for a decision." />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="h2 mb-2">Time off to decide</h2>
          {pending.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="card divide-y divide-slate-100 p-0">
              {pending.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <div><b>{o.user.name}</b> · {range(o)}</div>
                    <div className="text-xs text-slate-500">{o.reason ?? "No reason given"} · asked {fmtDateTime(o.createdAt)}</div>
                    {jobsDuring(o) > 0 && <div className="mt-1 text-xs font-semibold text-amber-600">Has {jobsDuring(o)} job{jobsDuring(o) === 1 ? "" : "s"} on those days: reassign them if you approve.</div>}
                  </div>
                  <span className="flex gap-2">
                    <form action={decideTimeOff.bind(null, o.id, true)}><button className="btn-success">Approve</button></form>
                    <form action={decideTimeOff.bind(null, o.id, false)}><button className="btn-secondary">Deny</button></form>
                  </span>
                </div>
              ))}
            </div>
          )}

          <h2 className="h2 mb-2 mt-6">Open shifts asked for</h2>
          {claims.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <div className="card divide-y divide-slate-100 p-0">
              {claims.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <div><b>{c.user.name}</b> · <Link className="underline" href={`/jobs/${c.assignmentId}`}>{c.job.location.name}</Link></div>
                    <div className="text-xs text-slate-500">{fmtDate(c.job.date)} {c.job.startTime}{c.job.endTime ? `–${c.job.endTime}` : ""}</div>
                  </div>
                  <span className="flex gap-2">
                    <form action={decideClaim.bind(null, c.id, true)}><button className="btn-success">Approve</button></form>
                    <form action={decideClaim.bind(null, c.id, false)}><button className="btn-secondary">Deny</button></form>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="h2 mb-2">Coming up: approved time off</h2>
          {approved.length === 0 ? <Empty>No one is off.</Empty> : (
            <div className="card divide-y divide-slate-100 p-0">
              {approved.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span><b>{o.user.name}</b> · {range(o)}</span><Badge value="APPROVED" /></div>
              ))}
            </div>
          )}

          <h2 className="h2 mb-2 mt-6">Team availability</h2>
          <div className="card overflow-x-auto p-0">
            <table className="tbl">
              <thead><tr><th>Who</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name.split(" ")[0]}</td>
                    {DAYS.map((_, d) => {
                      const a = avail.find((x) => x.userId === u.id && x.weekday === d);
                      return <td key={d} className="whitespace-nowrap text-xs">{!a ? <span className="text-slate-400">any</span> : a.available ? `${a.startTime}–${a.endTime}` : <span className="text-red-600">off</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
