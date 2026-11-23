import { Building2, MapPin } from "lucide-react";
import { admin, must } from "@/lib/supabase/server";
import type { Client, Location, Profile, Sop, SopAck } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SopForm } from "@/components/SopForm";
import { SopContent } from "@/components/SopContent";
import { signedUrls } from "@/lib/storage";
import { parseScope, scopeValue } from "@/lib/sops";
import { AckButton } from "./AckButton";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Sops({ searchParams }: { searchParams: Promise<{ q?: string; for?: string }> }) {
  const user = await requireUser();
  const { q, for: preset } = await searchParams;
  const sb = admin();
  let query = sb.from("Sop").select("*, location:Location(name), client:Client(name), acks:SopAck(*, user:User(name))").order("category").order("title");
  const term = (q ?? "").replace(/[,()*%\\]/g, " ").trim();
  if (term) query = query.or(`title.ilike.*${term}*,body.ilike.*${term}*`);
  const sops = must(await query, "SOPs") as (Sop & { location: Pick<Location, "name"> | null; client: Pick<Client, "name"> | null; acks: (SopAck & { user: Pick<Profile, "name"> })[] })[];
  const staffCount = (await sb.from("User").select("id", { count: "exact", head: true }).eq("active", true)).count ?? 0;
  const mgr = user.role !== "STAFF";
  const [fileUrls, clients, locations] = await Promise.all([
    signedUrls(sops.map((s) => s.filePath)),
    mgr ? sb.from("Client").select("id, name").order("name").then((r) => must(r, "clients") as Pick<Client, "id" | "name">[]) : [],
    mgr ? sb.from("Location").select("id, name").eq("active", true).order("name").then((r) => must(r, "locations") as Pick<Location, "id" | "name">[]) : [],
  ]);
  const scopes = { clients, locations };
  const newScope = scopeValue(parseScope(preset));
  const groups = new Map<string, typeof sops>();
  for (const s of sops) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <>
      <PageHeader title="SOPs" subtitle="Standard operating procedures. Mark each one as read." />
      <form className="mb-4"><input name="q" defaultValue={q} className="input max-w-sm" placeholder="Search SOPs…" /></form>
      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{cat}</h2>
          <div className="space-y-2">
            {list.map((s) => {
              const acked = s.acks.some((a) => a.userId === user.id && a.version === s.version);
              const current = s.acks.filter((a) => a.version === s.version);
              return (
                <details key={s.id} id={s.id} className="card">
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="font-semibold">{s.title}{s.location && <span className="ml-2 text-xs font-normal text-slate-500"><MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{s.location.name}</span>}{s.client && <span className="ml-2 text-xs font-normal text-slate-500"><Building2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{s.client.name}</span>}</span>
                    <span className={`badge ${acked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{acked ? "read" : "to read"}</span>
                  </summary>
                  <SopContent sop={s} fileUrl={s.filePath ? fileUrls[s.filePath] : undefined} />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>Version {s.version} · updated {fmtDate(s.updatedAt)}{mgr && ` · read by ${current.length}/${staffCount}: ${current.map((a) => a.user.name.split(" ")[0]).join(", ") || "nobody yet"}`}</span>
                    {!acked && <AckButton id={s.id} />}
                  </div>
                  {mgr && (
                    <details className="mt-3 border-t border-slate-100 pt-2">
                      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Edit</summary>
                      <SopForm sop={s} scope={scopeValue(s)} scopes={scopes} back="/sops" />
                    </details>
                  )}
                </details>
              );
            })}
          </div>
        </section>
      ))}
      {mgr && (
        <details id="new" className="card max-w-2xl" open={!!newScope}>
          <summary className="cursor-pointer font-semibold text-brand-600">New SOP</summary>
          <SopForm key={newScope} scope={newScope} scopes={scopes} back="/sops" />
        </details>
      )}
    </>
  );
}
