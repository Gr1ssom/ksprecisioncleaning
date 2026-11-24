"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { lineTotal, money, today } from "@/lib/format";
import { invoiceLines } from "@/lib/billing";
import { rateBook } from "@/lib/pricing";
import { audit } from "@/lib/audit";
import { ensureWaveCustomer, sendWaveInvoice, waveConfigured } from "@/lib/wave";
import type { Assignment, Client, Invoice, Location, ServiceType } from "@/lib/types";

type Visit = Assignment & { location: Location; serviceType: ServiceType | null };

/** Build an invoice from selected completed visits + optional extra line. */
export async function createInvoice(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const clientId = String(form.get("clientId"));
  const ids = form.getAll("assignmentId").map(String);
  const visits = (ids.length
    ? must(await sb.from("Assignment").select("*, location:Location!inner(*), serviceType:ServiceType(*)")
        .in("id", ids).is("invoiceId", null).eq("noCharge", false).eq("location.clientId", clientId).order("date"), "visits")
    : []) as Visit[];
  const rate = await rateBook();
  // One line per location + service type, priced from the client's rate for that service.
  const { lines, unpriced } = invoiceLines(visits, (svc) => rate(clientId, svc));
  if (unpriced.length) {
    const names = [...new Set(unpriced.map((v) => v.serviceType?.name ?? "No service type"))].join(", ");
    redirect(`/invoices/new?clientId=${clientId}&error=${encodeURIComponent(`No price set for ${names}. Add it on the client, then try again.`)}`);
  }
  const extraDesc = String(form.get("extraDescription") ?? "").trim();
  const extraAmt = Number(form.get("extraAmount") || 0);
  if (extraDesc && extraAmt) lines.push({ description: extraDesc, quantity: 1, unitPrice: extraAmt });
  if (!lines.length) redirect(`/invoices/new?clientId=${clientId}&error=${encodeURIComponent("Pick at least one visit, or add an extra line with an amount.")}`);

  const terms = Number(form.get("terms") || 15);
  // One step in the database: the invoice (numbered by its sequence) and its visits linked together.
  const res = await sb.rpc("bill_visits", {
    p_client: clientId, p_visits: visits.map((v) => v.id), p_lines: lines, p_total: lineTotal(lines),
    p_issue: today(), p_due: today(terms), p_memo: String(form.get("memo") ?? "").trim() || null,
  });
  if (res.error?.message.includes("just billed")) redirect(`/invoices/new?clientId=${clientId}&error=${encodeURIComponent("Some of these visits were just billed. Check them again, then create the invoice.")}`);
  const inv = (must(res, "create invoice") as { id: string; number: string }[])[0];
  const total = lineTotal(lines);
  await audit(me, "invoice.create", "Invoice", inv.id, `Created ${inv.number} for ${money(total)} (${visits.length} visits)`, { after: { total, visits: visits.length } });
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function sendInvoiceToWave(id: string) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const inv = must(await sb.from("Invoice").select("*, client:Client(*)").eq("id", id).single(), "invoice") as Invoice & { client: Client };
  const fail = async (waveError: string) => { await sb.from("Invoice").update({ waveError }).eq("id", id); revalidatePath(`/invoices/${id}`); };
  if (!waveConfigured()) return fail("Wave isn't connected. Add WAVE_ACCESS_TOKEN and WAVE_BUSINESS_ID, then send again.");
  if (!inv.client.email) return fail("This client has no email. Add one on the client, then send again.");
  try {
    let customerId = inv.client.waveCustomerId;
    if (!customerId) {
      customerId = await ensureWaveCustomer(inv.client);
      await sb.from("Client").update({ waveCustomerId: customerId }).eq("id", inv.clientId);
    }
    const r = await sendWaveInvoice({
      customerId, email: inv.client.email, invoiceDate: inv.issueDate, dueDate: inv.dueDate, memo: inv.memo, lines: inv.lines,
      subject: `Invoice ${inv.number} from KS Precision Cleaning`,
      message: `Hi ${inv.client.contactName ?? inv.client.name}, thank you for your business! Your invoice is attached.`,
    });
    must(await sb.from("Invoice").update({ status: "SENT", sentAt: new Date().toISOString(), waveInvoiceId: r.waveInvoiceId, waveViewUrl: r.viewUrl, waveError: null }).eq("id", id), "mark sent");
    await audit(me, "invoice.send", "Invoice", id, `Sent ${inv.number} to ${inv.client.email} through Wave`);
  } catch (e) {
    await fail(`Wave rejected the invoice: ${(e as Error).message}`);
  }
  revalidatePath(`/invoices/${id}`);
}

export async function setInvoiceStatus(id: string, status: "PAID" | "VOID" | "SENT") {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const prev = must(await sb.from("Invoice").select("number, status").eq("id", id).single(), "invoice") as { number: string; status: string };
  must(await sb.from("Invoice").update({ status }).eq("id", id), "update invoice");
  // Voiding frees its visits to be billed again.
  if (status === "VOID") must(await sb.from("Assignment").update({ invoiceId: null }).eq("invoiceId", id), "release visits");
  await audit(me, `invoice.${status.toLowerCase()}`, "Invoice", id, `${prev.number}: ${prev.status.toLowerCase()} → ${status.toLowerCase()}`, { before: { status: prev.status }, after: { status } });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}
