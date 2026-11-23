"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { fmtDate, lineTotal, today, type Line } from "@/lib/format";
import { rateBook } from "@/lib/pricing";
import { ensureWaveCustomer, sendWaveInvoice, waveConfigured } from "@/lib/wave";
import type { Assignment, Client, Invoice, Location, ServiceType } from "@/lib/types";

async function nextNumber() {
  const { count } = await admin().from("Invoice").select("id", { count: "exact", head: true });
  return `KS-${String(1001 + (count ?? 0))}`;
}

type Visit = Assignment & { location: Location; serviceType: ServiceType | null };

/** Build an invoice from selected completed visits + optional extra line. */
export async function createInvoice(form: FormData) {
  await requireUser("MANAGER");
  const sb = admin();
  const clientId = String(form.get("clientId"));
  const ids = form.getAll("assignmentId").map(String);
  const visits = (ids.length
    ? must(await sb.from("Assignment").select("*, location:Location!inner(*), serviceType:ServiceType(*)")
        .in("id", ids).is("invoiceId", null).eq("location.clientId", clientId).order("date"), "visits")
    : []) as Visit[];
  const rate = await rateBook();
  const unpriced = visits.filter((v) => rate(clientId, v.serviceTypeId) == null);
  if (unpriced.length) {
    const names = [...new Set(unpriced.map((v) => v.serviceType?.name ?? "No service type"))].join(", ");
    throw new Error(`No price set for: ${names}. Add it on the client, then try again.`);
  }

  // One line per location + service type, priced from the client's rate for that service.
  const groups = new Map<string, { label: string; rate: number; dates: string[] }>();
  for (const v of visits) {
    const key = `${v.locationId}|${v.serviceTypeId}`;
    const e = groups.get(key) ?? { label: `${v.serviceType!.name} – ${v.location.name}`, rate: rate(clientId, v.serviceTypeId)!, dates: [] };
    e.dates.push(fmtDate(v.date).replace(/, \d{4}$/, ""));
    groups.set(key, e);
  }
  const lines: Line[] = [...groups.values()].map((e) => ({ description: `${e.label} (${e.dates.join(", ")})`, quantity: e.dates.length, unitPrice: e.rate }));
  const extraDesc = String(form.get("extraDescription") ?? "").trim();
  const extraAmt = Number(form.get("extraAmount") || 0);
  if (extraDesc && extraAmt) lines.push({ description: extraDesc, quantity: 1, unitPrice: extraAmt });
  if (!lines.length) throw new Error("Select at least one visit or add a line.");

  const terms = Number(form.get("terms") || 15);
  const inv = must(await sb.from("Invoice").insert({
    number: await nextNumber(), clientId, issueDate: today(), dueDate: today(terms), lines, total: lineTotal(lines),
    memo: String(form.get("memo") ?? "").trim() || null,
  }).select("id").single(), "create invoice") as { id: string };
  if (visits.length) must(await sb.from("Assignment").update({ invoiceId: inv.id }).in("id", visits.map((v) => v.id)), "link visits");
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function sendInvoiceToWave(id: string) {
  await requireUser("MANAGER");
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
  } catch (e) {
    await fail(`Wave rejected the invoice: ${(e as Error).message}`);
  }
  revalidatePath(`/invoices/${id}`);
}

export async function setInvoiceStatus(id: string, status: "PAID" | "VOID" | "SENT") {
  await requireUser("MANAGER");
  const sb = admin();
  must(await sb.from("Invoice").update({ status }).eq("id", id), "update invoice");
  // Voiding frees its visits to be billed again.
  if (status === "VOID") must(await sb.from("Assignment").update({ invoiceId: null }).eq("invoiceId", id), "release visits");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}
