import { BookOpen, Handshake, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Client, Location } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Locations() {
  const user = await requireUser();
  let lq = admin().from("Location").select("*, client:Client(name), sops:Sop(count), layouts:Layout(count)").order("active", { ascending: false }).order("name");
  if (user.role === "STAFF") lq = lq.eq("active", true);
  const locations = (must(await lq, "locations") as (Location & { client: Pick<Client, "name"> | null; sops: { count: number }[]; layouts: { count: number }[] })[])
    .map((l) => ({ ...l, _count: { sops: l.sops[0]?.count ?? 0, layouts: l.layouts[0]?.count ?? 0 } }));
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
              {l.client && <span><Handshake className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{l.client.name}</span>}<span><BookOpen className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{l._count.sops} SOPs</span><span><MapIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{l._count.layouts} floor plans</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
