import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { fmtDate, fmtDateTime, money, type Line } from "@/lib/format";
import { waveConfigured } from "@/lib/wave";
import { InvoiceActions } from "./InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("MANAGER");
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id }, include: { client: true } });
  if (!inv) notFound();
  const lines = inv.lines as Line[];
  return (
    <>
      <PageHeader title={`Invoice ${inv.number}`} subtitle={inv.client.name} action={<Badge value={inv.status} />} />
      {inv.waveError && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{inv.waveError}</div>}
      <div className="card mb-4 max-w-3xl">
        <div className="mb-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><div className="label">Bill to</div>{inv.client.name}<div className="text-xs text-slate-500">{inv.client.email}</div></div>
          <div><div className="label">Issued</div>{fmtDate(inv.issueDate)}</div>
          <div><div className="label">Due</div>{fmtDate(inv.dueDate)}</div>
          <div><div className="label">Wave</div>{inv.waveViewUrl ? <a href={inv.waveViewUrl} target="_blank" rel="noreferrer" className="text-brand-600 underline">View in Wave</a> : "—"}</div>
        </div>
        <table className="tbl">
          <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}><td>{l.description}</td><td className="text-right">{l.quantity}</td><td className="text-right">{money(l.unitPrice)}</td><td className="text-right">{money(l.quantity * l.unitPrice)}</td></tr>
            ))}
            <tr><td colSpan={3} className="text-right font-semibold">Total</td><td className="text-right text-lg font-bold">{money(inv.total)}</td></tr>
          </tbody>
        </table>
        {inv.memo && <p className="mt-3 text-sm text-slate-600">Memo: {inv.memo}</p>}
        {inv.sentAt && <p className="mt-2 text-xs text-slate-500">Sent {fmtDateTime(inv.sentAt)}</p>}
      </div>
      <InvoiceActions id={inv.id} status={inv.status} wave={waveConfigured()} />
    </>
  );
}
