import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { saveSop } from "@/app/actions/manage";
import { AckButton } from "./AckButton";

export const dynamic = "force-dynamic";

export default async function Sops({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const sops = await db.sop.findMany({
    where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {},
    include: { location: true, acks: { include: { user: true } } }, orderBy: [{ category: "asc" }, { title: "asc" }],
  });
  const staffCount = await db.user.count({ where: { active: true } });
  const mgr = user.role !== "STAFF";
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
                    <span className="font-semibold">{s.title}{s.location && <span className="ml-2 text-xs font-normal text-slate-500">📍 {s.location.name}</span>}</span>
                    <span className={`badge ${acked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{acked ? "read" : "to read"}</span>
                  </summary>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{s.body.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ol>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span>Version {s.version} · updated {s.updatedAt.toLocaleDateString()}{mgr && ` · read by ${current.length}/${staffCount}: ${current.map((a) => a.user.name.split(" ")[0]).join(", ") || "nobody yet"}`}</span>
                    {!acked && <AckButton id={s.id} />}
                  </div>
                  {mgr && !s.locationId && (
                    <form action={saveSop} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <input type="hidden" name="id" value={s.id} />
                      <div className="grid grid-cols-2 gap-2"><input name="title" defaultValue={s.title} className="input" /><input name="category" defaultValue={s.category} className="input" /></div>
                      <textarea name="body" defaultValue={s.body} rows={5} className="input" />
                      <button className="btn-secondary">Save as new version</button>
                      <p className="text-xs text-slate-500">Saving a new version asks everyone to read it again.</p>
                    </form>
                  )}
                </details>
              );
            })}
          </div>
        </section>
      ))}
      {mgr && (
        <details className="card max-w-2xl">
          <summary className="cursor-pointer font-semibold text-brand-600">＋ New company SOP</summary>
          <form action={saveSop} className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2"><input name="title" placeholder="Title" className="input" required /><input name="category" placeholder="Category" className="input" /></div>
            <textarea name="body" rows={6} className="input" placeholder="One step per line" required />
            <button className="btn-primary">Add</button>
          </form>
        </details>
      )}
    </>
  );
}
