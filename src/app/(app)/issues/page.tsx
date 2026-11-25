import { admin, must } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import type { Issue, Location, Profile } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { reportIssue } from "@/app/actions/field";
import { PhotoInput } from "@/components/PhotoInput";
import { fmtDate, fmtDateTime, today } from "@/lib/format";
import Link from "next/link";
import { followUpFromIssue } from "@/app/actions/quality";
import { ResolveButton } from "./ResolveButton";

export const dynamic = "force-dynamic";

export default async function Issues({ searchParams }: { searchParams: Promise<{ new?: string; locationId?: string; back?: string; status?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const sb = admin();
  let iq = sb.from("Issue").select("*, location:Location(name), reportedBy:User(name)").eq("status", status).order("createdAt", { ascending: false });
  if (user.role === "STAFF") iq = iq.eq("reportedById", user.id);
  const mgr = user.role !== "STAFF";
  const [ir, lr, sr] = await Promise.all([iq, sb.from("Location").select("id, name").eq("active", true).order("name"),
    mgr ? sb.from("User").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [], error: null })]);
  const issues = must(ir, "issues") as (Issue & { location: Pick<Location, "name"> | null; reportedBy: Pick<Profile, "name"> | null })[];
  const staff = must(sr, "team") as { id: string; name: string }[];
  // Re-cleans already booked for these issues.
  const reCleans = mgr && issues.length ? must(await sb.from("Assignment").select("id, date, status, issueId").in("issueId", issues.map((i) => i.id)), "re-cleans") as { id: string; date: string; status: string; issueId: string }[] : [];
  const locations = must(lr, "locations") as Pick<Location, "id" | "name">[];
  const photos = await signedUrls(issues.map((i) => i.photoPath));
  return (
    <>
      <PageHeader title="Issues" subtitle="Damage, broken fixtures, client requests and complaints, safety problems." />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      <details className="card mb-5 max-w-2xl" open={!!sp.new}>
        <summary className="cursor-pointer font-semibold text-brand-600">Report an issue</summary>
        <form action={reportIssue} className="mt-3 space-y-3">
          {sp.back && <input type="hidden" name="back" value={sp.back} />}
          <input name="title" className="input" placeholder="What's wrong?" required />
          <select name="locationId" className="input" defaultValue={sp.locationId ?? ""}>
            <option value="">No specific location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <textarea name="detail" rows={3} className="input" placeholder="Details" />
          <div><span className="label">Photo</span><PhotoInput label="Take or choose a photo" className="btn-secondary" /></div>
          <button className="btn-primary">Submit</button>
        </form>
      </details>
      <div className="mb-3 flex gap-2 text-sm">
        <a href="/issues" className={`chip ${status === "OPEN" ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>Open</a>
        <a href="/issues?status=RESOLVED" className={`chip ${status === "RESOLVED" ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>Resolved</a>
      </div>
      <div className="space-y-3">
        {issues.map((i) => (
          <div key={i.id} className="card flex gap-4">
            {i.photoPath && photos[i.photoPath] && <a href={photos[i.photoPath]} target="_blank" rel="noreferrer"><img src={photos[i.photoPath]} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{i.title}</div><Badge value={i.status} /></div>
              <div className="text-xs text-slate-500">
                {i.source === "CLIENT" && <span className="badge mr-1 bg-red-100 text-red-700">client</span>}
                {i.location?.name ?? "General"} · {i.source === "CLIENT" ? "From the client's rating" : i.reportedBy?.name ?? "Someone no longer on the team"} · {fmtDateTime(i.createdAt)}
                {i.assignmentId && mgr && <> · <Link href={`/jobs/${i.assignmentId}`} className="underline">the visit</Link></>}
              </div>
              {i.detail && <p className="mt-1 text-sm">{i.detail}</p>}
              {reCleans.filter((r) => r.issueId === i.id).map((r) => (
                <div key={r.id} className="mt-1 text-sm"><Link href={`/jobs/${r.id}`} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-2">Re-clean {fmtDate(r.date)}</Link> <Badge value={r.status} /></div>
              ))}
              {mgr && i.status === "OPEN" && (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <ResolveButton id={i.id} />
                  {i.locationId && !reCleans.some((r) => r.issueId === i.id) && (
                    <details className="w-full sm:w-auto">
                      <summary className="btn-secondary list-none">Book re-clean</summary>
                      <form action={followUpFromIssue} className="mt-2 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="issueId" value={i.id} />
                        <label className="text-sm"><span className="label">Date</span><input type="date" name="date" defaultValue={today(1)} className="input" required /></label>
                        <label className="text-sm"><span className="label">Start</span><input type="time" name="startTime" className="input" /></label>
                        <label className="text-sm"><span className="label">Who</span>
                          <select name="userId" className="input"><option value="">Unassigned</option>{staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                        </label>
                        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="charge" value="yes" />Bill this visit (leave off for a free re-clean)</label>
                        <button className="btn-primary w-fit">Book</button>
                      </form>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {issues.length === 0 && <Empty>No {status.toLowerCase()} issues.</Empty>}
      </div>
    </>
  );
}
