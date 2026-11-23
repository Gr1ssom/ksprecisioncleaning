import { admin, must } from "@/lib/supabase/server";
import type { Assignment, Location, Profile, ServiceType } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { createInvoice } from "@/app/actions/billing";
import { fmtDate, money } from "@/lib/format";
import { rateBook } from "@/lib/pricing";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const sb = admin();
  const clients = must(await sb.from("Client").select("id, name").order("name"), "clients") as { id: string; name: string }[];
  const clientId = sp.clientId ?? clients[0]?.id;
  const visits = (clientId
    ? must(await sb.from("Assignment").select("*, location:Location!inner(*), user:User!Assignment_userId_fkey(name), serviceType:ServiceType(*)")
        .eq("status", "COMPLETED").is("invoiceId", null).eq("location.clientId", clientId).order("date"), "visits")
    : []) as (Assignment & { location: Location; user: Pick<Profile, "name"> | null; serviceType: ServiceType | null })[];
  const rate = await rateBook();
  const unpriced = visits.filter((v) => rate(clientId, v.serviceTypeId) == null);
  return (
    <>
      <PageHeader title="New invoice" subtitle="Bill completed visits that haven't been invoiced yet." />
      <form className="mb-4 flex gap-2">
        <select name="clientId" defaultValue={clientId} className="input w-72">{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn-secondary">Load visits</button>
      </form>
      {clientId && (
        <form action={createInvoice} className="card max-w-3xl space-y-4">
          <input type="hidden" name="clientId" value={clientId} />
          <div>
            <div className="label">Unbilled visits</div>
            {visits.length ? (<>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {visits.map((v) => {
                  const price = rate(clientId, v.serviceTypeId);
                  return (
                    <label key={v.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${price == null ? "opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
                      <input type="checkbox" name="assignmentId" value={v.id} defaultChecked={price != null} disabled={price == null} className="h-4 w-4" />
                      <span className="flex-1">{fmtDate(v.date)} · {v.location.name} <span className="text-slate-500">· {v.serviceType?.name ?? "No service type"} · {v.user?.name}</span></span>
                      <span className="tabular-nums">{price == null ? <span className="text-amber-600">no price</span> : money(price)}</span>
                    </label>
                  );
                })}
              </div>
              {unpriced.length > 0 && (
                <p className="mt-2 text-sm text-amber-600">
                  {unpriced.length} visit{unpriced.length > 1 ? "s have" : " has"} no price for {[...new Set(unpriced.map((v) => v.serviceType?.name ?? "no service type"))].join(", ")}.{" "}
                  <Link href="/clients" className="underline">Set prices on the client</Link> to bill them.
                </p>
              )}
            </>) : <Empty>No unbilled visits for this client.</Empty>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <input name="extraDescription" className="input" placeholder="Extra line (e.g. Carpet shampoo – lobby)" />
            <input name="extraAmount" type="number" step="0.01" className="input" placeholder="Amount" />
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <select name="terms" className="input" defaultValue="15"><option value="0">Due on receipt</option><option value="15">Net 15</option><option value="30">Net 30</option></select>
            <input name="memo" className="input" placeholder="Memo shown on invoice (optional)" />
          </div>
          <button className="btn-primary">Create draft</button>
        </form>
      )}
    </>
  );
}
