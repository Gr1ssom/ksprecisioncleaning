"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, isoDay, lineTotal, todayUTC, type Line } from "@/lib/format";
import { ensureWaveCustomer, sendWaveInvoice, waveConfigured } from "@/lib/wave";

async function nextNumber() {
  const count = await db.invoice.count();
  return `KS-${String(1001 + count)}`;
}

/** Build an invoice from selected completed visits + optional extra lines. */
export async function createInvoice(form: FormData) {
  await requireUser("MANAGER");
  const clientId = String(form.get("clientId"));
  const ids = form.getAll("assignmentId").map(String);
  const visits = await db.assignment.findMany({ where: { id: { in: ids }, invoiceId: null }, include: { location: true }, orderBy: { date: "asc" } });

  // Group visits by location → one line per location.
  const byLoc = new Map<string, { name: string; rate: number; dates: string[] }>();
  for (const v of visits) {
    const e = byLoc.get(v.locationId) ?? { name: v.location.name, rate: Number(v.location.billingRate), dates: [] };
    e.dates.push(fmtDate(v.date).replace(/, \d{4}$/, ""));
    byLoc.set(v.locationId, e);
  }
  const lines: Line[] = [...byLoc.values()].map((e) => ({
    description: `Cleaning – ${e.name} (${e.dates.join(", ")})`, quantity: e.dates.length, unitPrice: e.rate,
  }));
  const extraDesc = String(form.get("extraDescription") ?? "").trim();
  const extraAmt = Number(form.get("extraAmount") || 0);
  if (extraDesc && extraAmt) lines.push({ description: extraDesc, quantity: 1, unitPrice: extraAmt });
  if (!lines.length) throw new Error("Select at least one visit or add a line");

  const terms = Number(form.get("terms") || 15);
  const inv = await db.invoice.create({
    data: {
      number: await nextNumber(), clientId, issueDate: todayUTC(), dueDate: todayUTC(terms), lines, total: lineTotal(lines),
      memo: String(form.get("memo") ?? "").trim() || null,
      assignments: { connect: visits.map((v) => ({ id: v.id })) },
    },
  });
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}`);
}

export async function sendInvoiceToWave(id: string) {
  await requireUser("MANAGER");
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { client: true } });
  if (!waveConfigured()) {
    await db.invoice.update({ where: { id }, data: { waveError: "Wave isn't connected. Add WAVE_ACCESS_TOKEN and WAVE_BUSINESS_ID, then send again." } });
    revalidatePath(`/invoices/${id}`);
    return;
  }
  if (!inv.client.email) {
    await db.invoice.update({ where: { id }, data: { waveError: "This client has no email. Add one on the client, then send again." } });
    revalidatePath(`/invoices/${id}`);
    return;
  }
  try {
    let customerId = inv.client.waveCustomerId;
    if (!customerId) {
      customerId = await ensureWaveCustomer(inv.client);
      await db.client.update({ where: { id: inv.clientId }, data: { waveCustomerId: customerId } });
    }
    const r = await sendWaveInvoice({
      customerId, email: inv.client.email, invoiceDate: isoDay(inv.issueDate), dueDate: isoDay(inv.dueDate), memo: inv.memo,
      lines: inv.lines as Line[], subject: `Invoice ${inv.number} from KS Precision Cleaning`,
      message: `Hi ${inv.client.contactName ?? inv.client.name}, thank you for your business! Your invoice is attached.`,
    });
    await db.invoice.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), waveInvoiceId: r.waveInvoiceId, waveViewUrl: r.viewUrl, waveError: null } });
  } catch (e) {
    await db.invoice.update({ where: { id }, data: { waveError: `Wave rejected the invoice: ${(e as Error).message}` } });
  }
  revalidatePath(`/invoices/${id}`);
}

export async function setInvoiceStatus(id: string, status: "PAID" | "VOID" | "SENT") {
  await requireUser("MANAGER");
  await db.invoice.update({
    where: { id },
    data: { status, ...(status === "VOID" ? { assignments: { set: [] } } : {}) },
  });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}
