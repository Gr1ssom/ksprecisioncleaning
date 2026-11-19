import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { saveClient } from "@/app/actions/manage";

export const dynamic = "force-dynamic";

type C = { id?: string; name?: string; contactName?: string | null; email?: string | null; phone?: string | null; billingAddress?: string | null; waveCustomerId?: string | null; notes?: string | null };
function ClientFields({ c }: { c?: C }) {
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
      <button className="btn-primary w-fit">Save</button>
    </form>
  );
}

export default async function Clients() {
  await requireUser("MANAGER");
  const clients = await db.client.findMany({ include: { locations: true, invoices: { where: { status: "SENT" } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Clients" />
      <div className="space-y-3">
        {clients.map((c) => (
          <details key={c.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span><span className="font-semibold">{c.name}</span> <span className="text-sm text-slate-500">· {c.contactName ?? "no contact"} · {c.email ?? "no email"}</span></span>
              <span className="flex gap-2 text-xs">
                <span className="badge bg-slate-100 text-slate-700">{c.locations.length} locations</span>
                {c.invoices.length > 0 && <span className="badge bg-blue-100 text-blue-700">{c.invoices.length} unpaid</span>}
                {c.waveCustomerId ? <span className="badge bg-emerald-100 text-emerald-700">linked to Wave</span> : <span className="badge bg-slate-100 text-slate-500">not in Wave yet</span>}
              </span>
            </summary>
            <ClientFields c={c} />
          </details>
        ))}
        <details className="card"><summary className="cursor-pointer font-semibold text-brand-600">＋ New client</summary><ClientFields /></details>
      </div>
    </>
  );
}
