import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { createInvoice } from "@/app/actions/billing";
import { fmtDate, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const clients = await db.client.findMany({ orderBy: { name: "asc" } });
  const clientId = sp.clientId ?? clients[0]?.id;
  const visits = clientId
    ? await db.assignment.findMany({ where: { status: "COMPLETED", invoiceId: null, location: { clientId } }, include: { location: true, user: true }, orderBy: { date: "asc" } })
    : [];
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
            {visits.length ? (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {visits.map((v) => (
                  <label key={v.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" name="assignmentId" value={v.id} defaultChecked className="h-4 w-4" />
                    <span className="flex-1">{fmtDate(v.date)} · {v.location.name} <span className="text-slate-500">· {v.user?.name}</span></span>
                    <span className="tabular-nums">{money(v.location.billingRate)}</span>
                  </label>
                ))}
              </div>
            ) : <Empty>No unbilled visits for this client.</Empty>}
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
