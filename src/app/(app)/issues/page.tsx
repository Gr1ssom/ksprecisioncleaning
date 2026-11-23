import { admin, must } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/storage";
import type { Issue, Location, Profile } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { reportIssue } from "@/app/actions/field";
import { PhotoInput } from "@/components/PhotoInput";
import { fmtDateTime } from "@/lib/format";
import { ResolveButton } from "./ResolveButton";

export const dynamic = "force-dynamic";

export default async function Issues({ searchParams }: { searchParams: Promise<{ new?: string; locationId?: string; back?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status === "RESOLVED" ? "RESOLVED" : "OPEN";
  const sb = admin();
  let iq = sb.from("Issue").select("*, location:Location(name), reportedBy:User(name)").eq("status", status).order("createdAt", { ascending: false });
  if (user.role === "STAFF") iq = iq.eq("reportedById", user.id);
  const [ir, lr] = await Promise.all([iq, sb.from("Location").select("id, name").eq("active", true).order("name")]);
  const issues = must(ir, "issues") as (Issue & { location: Pick<Location, "name"> | null; reportedBy: Pick<Profile, "name"> })[];
  const locations = must(lr, "locations") as Pick<Location, "id" | "name">[];
  const photos = await signedUrls(issues.map((i) => i.photoPath));
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
