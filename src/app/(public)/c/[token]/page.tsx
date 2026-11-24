import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Star } from "lucide-react";
import { loadPortal } from "@/lib/clientReports";
import { Badge, Empty } from "@/components/ui";
import { fmtDate, money, today } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A client's read-only portal: upcoming visits, past visit reports and invoices. Opened by its secret link. */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await loadPortal(token);
  if (!p) notFound();
  const now = today();
  return (
    <>
      <div className="eyebrow">Your visits</div>
      <h1 className="h1 mt-1">{p.clientName}</h1>
      <p className="muted mt-1">Upcoming visits, reports from past visits, and your invoices.</p>

      <section className="mt-6">
        <div className="mb-2 flex items-center gap-3"><h2 className="h2">Upcoming</h2><span className="rule" /></div>
        {p.upcoming.length ? (
          <ul className="card divide-y divide-slate-100 p-0 text-sm">
            {p.upcoming.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3">
                <span className="font-semibold">{fmtDate(v.date)} · {v.startTime}</span>
                <span className="text-slate-600">{v.location}{v.service ? ` · ${v.service}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>No visits scheduled yet.</Empty>}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center gap-3"><h2 className="h2">Past visits</h2><span className="rule" /></div>
        {p.past.length ? (
          <ul className="card divide-y divide-slate-100 p-0 text-sm">
            {p.past.map((v) => (
              <li key={v.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                <span><span className="font-semibold">{fmtDate(v.date)}</span> <span className="text-slate-600">· {v.location}{v.service ? ` · ${v.service}` : ""}</span></span>
                <span className="flex items-center gap-3">
                  {v.rating != null && <span className="inline-flex items-center gap-0.5 text-xs text-slate-600"><Star className="h-3.5 w-3.5 fill-current" />{v.rating}/5</span>}
                  {v.reportToken
                    ? <Link href={`/r/${v.reportToken}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">Report</Link>
                    : <span className="text-xs text-slate-500">No report</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty>No finished visits in the last 6 months.</Empty>}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center gap-3"><h2 className="h2">Invoices</h2><span className="rule" /></div>
        {p.invoices.length ? (
          <ul className="card divide-y divide-slate-100 p-0 text-sm">
            {p.invoices.map((i) => (
              <li key={i.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                <span><span className="font-semibold">{i.number}</span> <span className="text-slate-600">· {fmtDate(i.issueDate)}</span>
                  {i.status === "SENT" && <span className={`block text-xs ${i.dueDate < now ? "font-semibold text-red-600" : "text-slate-500"}`}>Due {fmtDate(i.dueDate)}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{money(i.total)}</span>
                  <Badge value={i.status} label={i.status === "SENT" ? "unpaid" : "paid"} />
                  {i.viewUrl && <a href={i.viewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-2">View<ExternalLink className="h-3.5 w-3.5" /></a>}
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty>No invoices yet.</Empty>}
      </section>
    </>
  );
}
