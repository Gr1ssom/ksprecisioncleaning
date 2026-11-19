import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { reportIssue } from "@/app/actions/field";
import { fmtDateTime } from "@/lib/format";
import { ResolveButton } from "./ResolveButton";

export const dynamic = "force-dynamic";

export default async function Issues({ searchParams }: { searchParams: Promise<{ new?: string; locationId?: string; back?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const [issues, locations] = await Promise.all([
    db.issue.findMany({ where: { status, ...(user.role === "STAFF" ? { reportedById: user.id } : {}) }, include: { location: true, reportedBy: true }, orderBy: { createdAt: "desc" } }),
    db.location.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Issues" subtitle="Damage, broken fixtures, client requests, safety problems." />
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
          <div><label className="label">Photo</label><input type="file" name="photo" accept="image/*" capture="environment" className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-ink file:px-4 file:font-semibold file:text-paper" /></div>
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
            {i.photoData && <a href={i.photoData} target="_blank" rel="noreferrer"><img src={i.photoData} alt="" className="h-20 w-20 rounded-lg object-cover" /></a>}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2"><div className="font-semibold">{i.title}</div><Badge value={i.status} /></div>
              <div className="text-xs text-slate-500">{i.location?.name ?? "General"} · {i.reportedBy.name} · {fmtDateTime(i.createdAt)}</div>
              {i.detail && <p className="mt-1 text-sm">{i.detail}</p>}
              {user.role !== "STAFF" && i.status === "OPEN" && <div className="mt-2"><ResolveButton id={i.id} /></div>}
            </div>
          </div>
        ))}
        {issues.length === 0 && <Empty>No {status.toLowerCase()} issues.</Empty>}
      </div>
    </>
  );
}
