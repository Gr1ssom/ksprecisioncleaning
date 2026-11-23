import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import type { Client, Invoice } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate, money, today } from "@/lib/format";
import { waveConfigured } from "@/lib/wave";

export const dynamic = "force-dynamic";

export default async function Invoices() {
  await requireUser("MANAGER");
  const invoices = must(await admin().from("Invoice").select("*, client:Client(*)").order("createdAt", { ascending: false }), "invoices") as (Invoice & { client: Client })[];
  const now = today();
  const sum = (st: string) => invoices.filter((i) => i.status === st).reduce((s, i) => s + Number(i.total), 0);
  const overdue = invoices.filter((i) => i.status === "SENT" && i.dueDate < now);
  return (
    <>
      <PageHeader title="Invoices" subtitle={waveConfigured() ? "Connected to Wave" : "Wave not connected yet – invoices save as drafts"} action={<Link href="/invoices/new" className="btn-primary">New invoice</Link>} />
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
                  <td><Link href={`/invoices/${i.id}`} className="-my-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-2">{i.number}</Link></td>
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
