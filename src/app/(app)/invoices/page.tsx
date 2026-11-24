import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Client, Invoice } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate, money, today } from "@/lib/format";
import { waveConfigured } from "@/lib/wave";
import { checkWaveNow, runMonthlyDrafts } from "@/app/actions/quality";
import { FilePlus2, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ drafts?: string; unpriced?: string; label?: string; wave?: string }> }) {
  await requireUser("MANAGER");
  const sp = await searchParams;
  const wave = waveConfigured();
  const invoices = must(await admin().from("Invoice").select("*, client:Client(*)").order("createdAt", { ascending: false }), "invoices") as (Invoice & { client: Client })[];
  const now = today();
  const sum = (st: string) => invoices.filter((i) => i.status === st).reduce((s, i) => s + Number(i.total), 0);
  const overdue = invoices.filter((i) => i.status === "SENT" && i.dueDate < now);
  return (
    <>
      <PageHeader title="Invoices" subtitle={wave ? "Connected to Wave · paid status checked about once an hour" : "Wave not connected yet – invoices save as drafts"} action={<Link href="/invoices/new" className="btn-primary">New invoice</Link>} />
      {sp.drafts != null && (
        <div className={`mb-4 rounded-xl p-3 text-sm ${Number(sp.drafts) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
          {Number(sp.drafts) ? `Made ${sp.drafts} draft invoice${sp.drafts === "1" ? "" : "s"} for visits through ${sp.label}. Check each one, then send it.` : `No unbilled, priced visits before this month, so no drafts were made.`}
          {Number(sp.unpriced) > 0 && ` ${sp.unpriced} visit${sp.unpriced === "1" ? " has" : "s have"} no price and stayed out: set the client's price, then run it again.`}
        </div>
      )}
      {sp.wave && <div className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{sp.wave === "off" ? "Wave isn't connected, so there's nothing to check." : `Checked Wave: ${sp.wave} invoice${sp.wave === "1" ? "" : "s"} newly paid.`}</div>}
      <div className="mb-5 flex flex-wrap gap-2">
        <form action={runMonthlyDrafts}><button className="btn-secondary"><FilePlus2 className="h-4 w-4" />Create this month&apos;s drafts</button></form>
        {wave && <form action={checkWaveNow}><button className="btn-secondary"><RefreshCw className="h-4 w-4" />Check Wave for payments</button></form>}
        <p className="basis-full text-xs text-slate-500">Drafts are also made on the 1st of each month: one per client, from completed visits before that month that aren&apos;t billed yet. Visits without a price and free re-cleans stay out.</p>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Drafts" value={money(sum("DRAFT"))} />
        <Stat label="Sent, unpaid" value={money(sum("SENT"))} tone="blue" />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "red" : "slate"} />
        <Stat label="Paid" value={money(sum("PAID"))} tone="green" />
      </div>
      {invoices.length === 0 ? <Empty>No invoices yet. Create one from completed visits.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>#</th><th>Client</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td><Link href={`/invoices/${i.id}`} className="-my-2 inline-flex min-h-11 min-w-11 items-center whitespace-nowrap font-semibold underline underline-offset-2">{i.number}</Link></td>
                  <td>{i.client.name}</td><td>{fmtDate(i.issueDate)}</td>
                  <td className={i.status === "SENT" && i.dueDate < now ? "font-semibold text-red-600" : ""}>{fmtDate(i.dueDate)}</td>
                  <td className="text-right tabular-nums">{money(i.total)}</td><td><Badge value={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
