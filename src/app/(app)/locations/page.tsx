import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Locations() {
  const user = await requireUser();
  const locations = await db.location.findMany({
    where: user.role === "STAFF" ? { active: true } : {},
    include: { client: true, _count: { select: { sops: true, layouts: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return (
    <>
      <PageHeader title="Locations" subtitle="Site info, SOPs and floor plans" action={user.role !== "STAFF" && <Link href="/locations/new" className="btn-primary">New location</Link>} />
      <div className="grid gap-3 md:grid-cols-2">
        {locations.map((l) => (
          <Link key={l.id} href={`/locations/${l.id}`} className={`card hover:border-brand-500 ${l.active ? "" : "opacity-60"}`}>
            <div className="flex justify-between gap-2">
              <div className="font-semibold">{l.name}</div>
              {!l.active && <span className="badge bg-slate-100 text-slate-500">inactive</span>}
            </div>
            <div className="text-sm text-slate-500">{l.address}</div>
            <div className="mt-2 flex gap-3 text-xs text-slate-500">
              {l.client && <span>🤝 {l.client.name}</span>}<span>📘 {l._count.sops} SOPs</span><span>🗺️ {l._count.layouts} floor plans</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
