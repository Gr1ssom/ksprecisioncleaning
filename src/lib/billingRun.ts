import "server-only";
import { admin, must } from "./supabase/server";
import { audit } from "./audit";
import { billingWindow, invoiceLines, wavePaid, type BillableVisit } from "./billing";
import { lineTotal, localDate, money, today } from "./format";
import { leads, notify } from "./notify";
import { rateBook } from "./pricing";
import { waveConfigured, waveInvoiceStatuses } from "./wave";
import type { Invoice } from "./types";

type Actor = { id: string } | null;
export type DraftsResult = { skipped?: boolean; month: string; label: string; invoices: number; total: number; unpriced: number };

/**
 * Monthly billing: one draft invoice per client from completed, unbilled, chargeable visits dated
 * before this month (priced through rateBook(); visits without a price stay out, never $0).
 * `claim` (the scheduled run) makes the month's run happen once; the button can run it again,
 * which only picks up visits nobody has billed yet.
 */
export async function createMonthlyDrafts(actor: Actor, opts: { claim: boolean; day?: string }): Promise<DraftsResult> {
  const sb = admin();
  const w = billingWindow(opts.day ?? localDate(new Date()));
  if (opts.claim) {
    const got = must(await sb.from("BillingRun").upsert({ month: w.month, byId: actor?.id ?? null }, { onConflict: "month", ignoreDuplicates: true }).select("month"), "billing run") as { month: string }[];
    if (!got.length) return { skipped: true, month: w.month, label: w.label, invoices: 0, total: 0, unpriced: 0 };
  }
  const visits = must(await sb.from("Assignment")
    .select("id, date, locationId, serviceTypeId, location:Location!inner(name, clientId), serviceType:ServiceType(name)")
    .eq("status", "COMPLETED").is("invoiceId", null).eq("noCharge", false).lt("date", w.before).not("location.clientId", "is", null), "unbilled visits") as unknown as (BillableVisit & { location: { name: string; clientId: string } })[];
  const rate = await rateBook();
  const byClient = new Map<string, typeof visits>();
  for (const v of visits) byClient.set(v.location.clientId, [...(byClient.get(v.location.clientId) ?? []), v]);
  let invoices = 0, total = 0, unpriced = 0;
  for (const [clientId, list] of byClient) {
    const r = invoiceLines(list, (svc) => rate(clientId, svc));
    unpriced += r.unpriced.length;
    if (!r.priced.length) continue;
    const sum = lineTotal(r.lines);
    const res = await sb.rpc("bill_visits", {
      p_client: clientId, p_visits: r.priced.map((v) => v.id), p_lines: r.lines, p_total: sum,
      p_issue: today(), p_due: today(15), p_memo: `Cleaning visits through ${w.label}`,
    });
    // Someone billed one of these visits a moment ago: skip this client; the next run picks up the rest.
    if (res.error?.message.includes("just billed")) continue;
    const inv = (must(res, "create draft invoice") as { id: string; number: string }[])[0];
    invoices++; total += sum;
    await audit(actor, actor ? "invoice.create" : "auto.invoice.create", "Invoice", inv.id,
      `Monthly draft ${inv.number} for ${money(sum)} (${r.priced.length} visits through ${w.label})`, { after: { total: sum, visits: r.priced.length } });
  }
  await sb.from("BillingRun").upsert({ month: w.month, invoices, byId: actor?.id ?? null }, { onConflict: "month" });
  if (invoices && opts.claim) {
    await notify(await leads("both"), {
      kind: "billing", title: `${invoices} draft invoice${invoices === 1 ? "" : "s"} ready to review`,
      body: `${money(total)} for visits through ${w.label}.${unpriced ? ` ${unpriced} visit${unpriced === 1 ? " has" : "s have"} no price and were left out.` : ""}`,
      url: "/invoices", dedupe: `drafts:${w.month}`,
    });
  }
  return { month: w.month, label: w.label, invoices, total, unpriced };
}

/** Mark sent invoices paid when Wave says they are. Skips quietly when Wave isn't connected. */
export async function syncWavePaid(actor: Actor): Promise<{ skipped?: boolean; checked: number; paid: number }> {
  if (!waveConfigured()) return { skipped: true, checked: 0, paid: 0 };
  const sb = admin();
  const sent = must(await sb.from("Invoice").select("id, number, total, waveInvoiceId").eq("status", "SENT").not("waveInvoiceId", "is", null), "sent invoices") as Pick<Invoice, "id" | "number" | "total" | "waveInvoiceId">[];
  if (!sent.length) return { checked: 0, paid: 0 };
  const status = await waveInvoiceStatuses(sent.map((i) => i.waveInvoiceId!));
  let paid = 0;
  for (const inv of sent) {
    if (!wavePaid(status[inv.waveInvoiceId!])) continue;
    const upd = must(await sb.from("Invoice").update({ status: "PAID" }).eq("id", inv.id).eq("status", "SENT").select("id"), "mark paid") as { id: string }[];
    if (!upd.length) continue;
    paid++;
    await audit(actor, actor ? "invoice.paid" : "auto.invoice.paid", "Invoice", inv.id, `${inv.number}: sent → paid (Wave says paid, ${money(inv.total)})`, { before: { status: "SENT" }, after: { status: "PAID" } });
  }
  return { checked: sent.length, paid };
}
