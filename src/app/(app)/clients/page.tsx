import { admin, must } from "@/lib/supabase/server";
import type { Client, ClientRate, Location, ServiceType } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { saveClient } from "@/app/actions/manage";
import { money } from "@/lib/format";
import Link from "next/link";
import { BookOpen, MapPin } from "lucide-react";
import { NewLocations } from "./NewLocations";

export const dynamic = "force-dynamic";

type Svc = { id: string; name: string };
type Loc = { id: string; name: string; address: string; latitude: number | null; active: boolean };
type C = { locations?: Loc[]; sops?: { id: string; title: string }[]; rates?: { serviceTypeId: string; price: unknown }[]; id?: string; name?: string; contactName?: string | null; email?: string | null; phone?: string | null; billingAddress?: string | null; waveCustomerId?: string | null; notes?: string | null };
function ClientFields({ c, services }: { c?: C; services: Svc[] }) {
  return (
    <form action={saveClient} className="mt-3 grid gap-2 sm:grid-cols-2">
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      <input name="name" defaultValue={c?.name} placeholder="Business / client name" className="input" required />
      <input name="contactName" defaultValue={c?.contactName ?? ""} placeholder="Contact" className="input" />
      <input name="email" type="email" defaultValue={c?.email ?? ""} placeholder="Billing email (invoices go here)" className="input" />
      <input name="phone" defaultValue={c?.phone ?? ""} placeholder="Phone" className="input" />
      <input name="billingAddress" defaultValue={c?.billingAddress ?? ""} placeholder="Billing address" className="input sm:col-span-2" />
      <input name="waveCustomerId" defaultValue={c?.waveCustomerId ?? ""} placeholder="Wave customer ID (blank = created on first send)" className="input sm:col-span-2" />
      <textarea name="notes" defaultValue={c?.notes ?? ""} placeholder="Notes" className="input sm:col-span-2" rows={2} />
      <fieldset className="sm:col-span-2">
        <legend className="label">Price per visit</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {services.map((t) => (
            <label key={t.id} className="text-sm">
              <span className="mb-1 block text-slate-600">{t.name}</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">$</span>
                <input name={`rate_${t.id}`} type="number" step="0.01" min="0" className="input pl-6"
                  defaultValue={c?.rates?.find((r) => r.serviceTypeId === t.id)?.price != null ? String(c.rates!.find((r) => r.serviceTypeId === t.id)!.price) : ""}
                  placeholder="Not priced" />
              </div>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Leave blank if you don&apos;t offer that service to this client. Visits without a price can&apos;t be invoiced.</p>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="label">Locations</legend>
        {c?.locations && c.locations.length > 0 && (
          <ul className="mb-2 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
            {c.locations.map((l) => (
              <li key={l.id}>
                <Link href={`/locations/${l.id}`} className="flex min-h-11 flex-wrap items-center gap-x-2 px-3 py-1.5 hover:underline">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-500" /><span className="font-semibold">{l.name}</span>
                  <span className="text-slate-500">{l.address}</span>
                  {!l.active && <span className="badge bg-slate-100 text-slate-700">inactive</span>}
                  {l.latitude == null && <span className="badge bg-amber-100 text-amber-800">no map position</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <NewLocations start={c?.id ? 0 : 1} />
      </fieldset>
      {c?.id && (
        <fieldset className="sm:col-span-2">
          <legend className="label">SOPs for this client</legend>
          {c.sops && c.sops.length > 0 && (
            <ul className="mb-2 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
              {c.sops.map((s) => <li key={s.id}><Link href={`/sops#${s.id}`} className="flex min-h-11 items-center gap-2 px-3 hover:underline"><BookOpen className="h-4 w-4 shrink-0 text-slate-500" />{s.title}</Link></li>)}
            </ul>
          )}
          <Link href={`/sops?for=client:${c.id}#new`} className="btn-secondary">Add SOP</Link>
        </fieldset>
      )}
      <button className="btn-primary w-fit">Save</button>
    </form>
  );
}

export default async function Clients() {
  await requireUser("MANAGER");
  const sb = admin();
  const [c, st] = await Promise.all([
    sb.from("Client").select("*, locations:Location(id, name, address, latitude, active), sops:Sop(id, title), rates:ClientRate(*), invoices:Invoice(id, status)").order("name"),
    sb.from("ServiceType").select("*").eq("active", true).order("sortOrder").order("name"),
  ]);
  const services = must(st, "services") as ServiceType[];
  const clients = (must(c, "clients") as (Client & { locations: Pick<Location, "id" | "name" | "address" | "latitude" | "active">[]; sops: { id: string; title: string }[]; rates: ClientRate[]; invoices: { id: string; status: string }[] })[])
    .map((x) => ({ ...x, locations: [...x.locations].sort((a, b) => a.name.localeCompare(b.name)), sops: [...x.sops].sort((a, b) => a.title.localeCompare(b.title)), invoices: x.invoices.filter((i) => i.status === "SENT") }));
  return (
    <>
      <PageHeader title="Clients" />
      <div className="space-y-3">
        {clients.map((c) => (
          <details key={c.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{c.name}</span> <span className="text-sm text-slate-500">· {c.contactName ?? "no contact"} · {c.email ?? "no email"}</span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {services.map((t) => {
                    const r = c.rates.find((x) => x.serviceTypeId === t.id);
                    return <span key={t.id}>{t.name}: {r ? <b className="text-slate-700">{money(r.price)}</b> : <span className="text-amber-600">not priced</span>}</span>;
                  })}
                </span>
              </span>
              <span className="flex gap-2 text-xs">
                <span className="badge bg-slate-100 text-slate-700">{c.locations.length} location{c.locations.length === 1 ? "" : "s"}</span>
                {c.invoices.length > 0 && <span className="badge bg-blue-100 text-blue-700">{c.invoices.length} unpaid</span>}
                {c.waveCustomerId ? <span className="badge bg-emerald-100 text-emerald-700">linked to Wave</span> : <span className="badge bg-slate-100 text-slate-500">not in Wave yet</span>}
              </span>
            </summary>
            <ClientFields c={c} services={services} />
          </details>
        ))}
        <details className="card"><summary className="cursor-pointer font-semibold text-brand-600">New client</summary><ClientFields services={services} /></details>
      </div>
    </>
  );
}
