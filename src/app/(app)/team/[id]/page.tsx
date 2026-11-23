import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { lastSignIns } from "@/lib/authUsers";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { assignableRoles, canManage, ROLE_INFO } from "@/lib/team";
import { fmtDate, fmtDateTime, hoursBetween, money, today, todayUTC } from "@/lib/format";
import type { Assignment, Location, Profile, TimeEntry } from "@/lib/types";
import { EmployeeForm } from "../EmployeeForm";
import { EmployeeActions } from "./EmployeeActions";

export const dynamic = "force-dynamic";

export default async function Employee({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  const me = await requireUser("MANAGER");
  const { id } = await params;
  const sp = await searchParams;
  const sb = admin();
  const emp = must(await sb.from("User").select("*").eq("id", id).maybeSingle(), "team member") as Profile | null;
  if (!emp) notFound();
  const manageable = canManage(me, emp);
  const isSelf = emp.id === me.id;
  const [entries, jobs, signIns] = await Promise.all([
    sb.from("TimeEntry").select("clockIn, clockOut, approved").eq("userId", id).gte("clockIn", todayUTC(-30).toISOString()).then((r) => must(r, "hours") as Pick<TimeEntry, "clockIn" | "clockOut" | "approved">[]),
    sb.from("Assignment").select("id, date, startTime, status, location:Location(name)").eq("userId", id).gte("date", today(-14)).order("date", { ascending: false }).limit(8)
      .then((r) => must(r, "jobs") as unknown as (Pick<Assignment, "id" | "date" | "startTime" | "status"> & { location: Pick<Location, "name"> })[]),
    lastSignIns(),
  ]);
  const hours30 = entries.reduce((s, e) => s + hoursBetween(e.clockIn, e.clockOut), 0);
  const weekStart = todayUTC(-((todayUTC().getUTCDay() + 6) % 7));
  const hoursWeek = entries.filter((e) => new Date(e.clockIn) >= weekStart).reduce((s, e) => s + hoursBetween(e.clockIn, e.clockOut), 0);

  return (
    <>
      <Link href="/team" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-slate-500"><ArrowLeft className="h-4 w-4" />Team</Link>
      <PageHeader title={emp.name} subtitle={`${emp.email}${emp.phone ? ` · ${emp.phone}` : ""}`}
        action={<div className="flex items-center gap-2"><Badge value={emp.role} label={ROLE_INFO[emp.role].label.toLowerCase()} />{!emp.active && <span className="badge bg-slate-100 text-slate-500">turned off</span>}</div>} />
      {sp.added && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Added. They can sign in now with their email and the starting password you set.</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hours this week" value={hoursWeek.toFixed(1)} />
        <Stat label="Hours, 30 days" value={hours30.toFixed(1)} />
        <Stat label="Last signed in" value={<span className="text-base">{signIns[id] ? fmtDateTime(signIns[id]!) : "Never"}</span>} />
        {me.role === "OWNER" ? <Stat label="Pay rate" value={`${money(emp.hourlyRate)}/h`} /> : <Stat label="Member since" value={<span className="text-base">{fmtDate(emp.createdAt)}</span>} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card">
          <h2 className="h2 mb-3">Details and access</h2>
          {manageable || isSelf ? (
            <EmployeeForm emp={emp} roles={isSelf ? [emp.role] : assignableRoles(me)} showPay={me.role === "OWNER"} lockRole={isSelf} />
          ) : (
            <p className="text-sm text-slate-600">{ROLE_INFO[emp.role].summary} Only the owner can change a {ROLE_INFO[emp.role].label.toLowerCase()}.</p>
          )}
        </section>
        <div className="space-y-5">
          {(manageable || isSelf) && (
            <section className="card">
              <h2 className="h2 mb-3">Login</h2>
              <EmployeeActions id={emp.id} name={emp.name} active={emp.active} isSelf={isSelf} />
            </section>
          )}
          <section className="card">
            <h2 className="h2 mb-2">Recent jobs</h2>
            {jobs.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {jobs.map((j) => (
                  <li key={j.id}><Link href={`/jobs/${j.id}`} className="flex min-h-11 items-center justify-between gap-2"><span>{fmtDate(j.date)} · {j.location.name}</span><Badge value={j.status} /></Link></li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No jobs in the last two weeks.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
