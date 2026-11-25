"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { audit, diff } from "@/lib/audit";
import { uploadImage } from "@/lib/storage";
import { notify } from "@/lib/notify";
import { createFollowUp } from "@/lib/followUps";
import { inspectionScore, RESULTS, type RoomResult } from "@/lib/quality";
import { ensureReport, emailVisitReport, newToken } from "@/lib/clientReports";
import { baseUrl, emailConfigured, linkEmail, sendEmail } from "@/lib/email";
import { createMonthlyDrafts, syncWavePaid } from "@/lib/billingRun";
import { parseTemplate } from "@/lib/templates";
import { today } from "@/lib/format";
import type { Assignment, Client, Inspection, InspectionRoom, Issue } from "@/lib/types";

const s = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ---------- Inspections ----------
async function inspectionFor(assignmentId: string, me: { id: string }) {
  const sb = admin();
  const a = must(await sb.from("Assignment").select("id, userId, locationId, status").eq("id", assignmentId).single(), "job") as Pick<Assignment, "id" | "userId" | "locationId" | "status">;
  await sb.from("Inspection").upsert({ assignmentId: a.id, inspectorId: me.id, cleanerId: a.userId, locationId: a.locationId }, { onConflict: "assignmentId", ignoreDuplicates: true });
  return { a, insp: must(await sb.from("Inspection").select("*").eq("assignmentId", a.id).single(), "inspection") as Inspection };
}

/** Score one room on a finished job: pass / touch-up / fail, with an optional note and photo. */
export async function scoreRoom(form: FormData): Promise<{ error?: string }> {
  const me = await requireUser("MANAGER");
  const result = String(form.get("result")) as RoomResult;
  if (!RESULTS.includes(result)) return { error: "Pick pass, touch-up or fail." };
  const roomId = String(form.get("roomId"));
  const room = must(await admin().from("Room").select("id, name").eq("id", roomId).maybeSingle(), "room") as { id: string; name: string } | null;
  if (!room) return { error: "That room was removed from the floor plan. Reload the page." };
  const { a, insp } = await inspectionFor(String(form.get("assignmentId")), me);
  const photo = form.get("photo");
  const photoPath = photo instanceof File && photo.size > 0 ? await uploadImage(photo, `inspections/${a.id}`) : undefined;
  const row: Record<string, unknown> = { inspectionId: insp.id, roomId: room.id, roomName: room.name, result, note: s(form, "note") };
  if (photoPath) row.photoPath = photoPath;
  must(await admin().from("InspectionRoom").upsert(row, { onConflict: "inspectionId,roomId" }), "save room score");
  revalidatePath(`/jobs/${a.id}/inspect`);
  return {};
}

/** Finish the inspection: score it, tell the cleaner, and book a re-clean for failed rooms. */
export async function finishInspection(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const { a, insp } = await inspectionFor(String(form.get("assignmentId")), me);
  const rooms = must(await sb.from("InspectionRoom").select("*").eq("inspectionId", insp.id), "room scores") as InspectionRoom[];
  if (!rooms.length) redirect(`/jobs/${a.id}/inspect?error=${encodeURIComponent("Score at least one room first.")}`);
  const score = inspectionScore(rooms.map((r) => r.result));
  const before = { score: insp.score, completedAt: insp.completedAt };
  must(await sb.from("Inspection").update({ score, note: s(form, "note"), completedAt: new Date().toISOString(), inspectorId: me.id }).eq("id", insp.id), "finish inspection");
  const loc = must(await sb.from("Location").select("name").eq("id", a.locationId).single(), "location") as { name: string };
  const passed = rooms.filter((r) => r.result === "PASS").length;
  const fails = rooms.filter((r) => r.result === "FAIL");
  await audit(me, "inspection.finish", "Inspection", insp.id, `Inspected ${loc.name}: ${passed}/${rooms.length} rooms passed (score ${score})`, diff(before, { score, completedAt: "now" }));
  await notify([a.userId].filter((id) => id !== me.id), {
    kind: "inspection", title: `Inspection: ${passed} of ${rooms.length} rooms passed`,
    body: `${loc.name}.${fails.length ? ` ${fails.length} room${fails.length === 1 ? "" : "s"} need a re-clean.` : " Great work!"}`,
    url: `/jobs/${a.id}`, dedupe: `inspection:${insp.id}:${rooms.length}:${passed}`,
  });
  let followUp: string | null = null;
  const existing = must(await sb.from("Assignment").select("id").eq("inspectionId", insp.id).limit(1), "re-cleans") as { id: string }[];
  if (fails.length && form.get("followUp") === "yes" && !existing.length) {
    const date = s(form, "followUpDate");
    followUp = await createFollowUp(me, {
      locationId: a.locationId, date: isDate(date) ? date! : today(1), userId: s(form, "followUpUserId"),
      startTime: s(form, "followUpStart"),
      tasks: fails.map((r) => `Re-clean ${r.roomName}${r.note ? `: ${r.note}` : ""}`),
      reason: `Re-clean after inspection: ${fails.map((r) => r.roomName).join(", ")} failed.`,
      followUpOfId: a.id, inspectionId: insp.id,
    });
  }
  revalidatePath("/", "layout");
  redirect(followUp ? `/jobs/${followUp}?created=followup` : `/jobs/${a.id}?inspected=1`);
}

// ---------- Issues → re-clean ----------
export async function followUpFromIssue(form: FormData) {
  const me = await requireUser("MANAGER");
  const issue = must(await admin().from("Issue").select("*, location:Location(name)").eq("id", String(form.get("issueId"))).single(), "issue") as Issue & { location: { name: string } | null };
  if (!issue.locationId) redirect(`/issues?error=${encodeURIComponent("Pick a location on the issue first: a re-clean needs a place.")}`);
  const date = s(form, "date");
  const id = await createFollowUp(me, {
    locationId: issue.locationId!, date: isDate(date) ? date! : today(1), userId: s(form, "userId"), startTime: s(form, "startTime"),
    tasks: [issue.title + (issue.detail ? `: ${issue.detail}` : "")],
    reason: `${issue.source === "CLIENT" ? "Client complaint" : "Issue"}: ${issue.title}`,
    followUpOfId: issue.assignmentId, issueId: issue.id, charge: form.get("charge") === "yes",
  });
  revalidatePath("/", "layout");
  redirect(`/jobs/${id}?created=followup`);
}

// ---------- Visit reports ----------
export async function makeReportLink(assignmentId: string) {
  await requireUser("MANAGER");
  await ensureReport(assignmentId);
  revalidatePath(`/jobs/${assignmentId}`);
}

export async function emailReport(assignmentId: string): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireUser("MANAGER");
  const err = await emailVisitReport(assignmentId);
  if (!err) await audit(me, "report.email", "Assignment", assignmentId, "Emailed the visit report to the client");
  revalidatePath(`/jobs/${assignmentId}`);
  return err ? { error: err } : { ok: true };
}

// ---------- Client portal ----------
export async function rotatePortalToken(clientId: string) {
  const me = await requireUser("OWNER");
  const c = must(await admin().from("Client").select("name").eq("id", clientId).single(), "client") as { name: string };
  must(await admin().from("Client").update({ portalToken: newToken() }).eq("id", clientId), "new portal link");
  // The token itself is a key: the log says it changed, never what it is.
  await audit(me, "client.portal_link", "Client", clientId, `Made a new portal link for ${c.name} (the old link stops working)`);
  revalidatePath("/clients");
}

export async function emailPortalLink(clientId: string): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireUser("MANAGER");
  const c = must(await admin().from("Client").select("*").eq("id", clientId).single(), "client") as Client;
  const to = c.reportEmail || c.email;
  if (!emailConfigured()) return { error: "Email isn't set up yet. Copy or text the link instead." };
  if (!to) return { error: "This client has no email. Add one, then send again." };
  try {
    const url = `${await baseUrl()}/c/${c.portalToken}`;
    await sendEmail({ to, subject: "Your KS Precision Cleaning visits and invoices", ...linkEmail({
      greeting: `Hi ${c.contactName ?? c.name},`, lines: ["This link shows your upcoming visits, past visit reports and invoices. Keep it handy; no password needed."],
      button: "Open my visits", url,
    }) });
    await audit(me, "client.portal_email", "Client", clientId, `Emailed the portal link to ${c.name}`);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------- Job templates ----------
export async function saveJobTemplate(form: FormData) {
  const me = await requireUser("MANAGER");
  const id = String(form.get("locationId"));
  const sb = admin();
  const prev = must(await sb.from("Location").select("name, jobTemplate").eq("id", id).single(), "location") as { name: string; jobTemplate: unknown };
  const tpl = parseTemplate({
    serviceTypeId: s(form, "serviceTypeId"), startTime: s(form, "startTime"), endTime: s(form, "endTime"), userId: s(form, "userId"),
    tasks: String(form.get("tasks") ?? "").split("\n"), notes: s(form, "notes"),
  });
  must(await sb.from("Location").update({ jobTemplate: tpl }).eq("id", id), "save job template");
  const ch = diff((parseTemplate(prev.jobTemplate) ?? {}) as Record<string, unknown>, (tpl ?? {}) as Record<string, unknown>);
  await audit(me, "location.template", "Location", id, `${tpl ? "Saved" : "Cleared"} the job template for ${prev.name}`, ch);
  revalidatePath(`/locations/${id}`);
  redirect(`/locations/${id}?saved=template`);
}

// ---------- Billing ----------
export async function runMonthlyDrafts() {
  const me = await requireUser("MANAGER");
  const r = await createMonthlyDrafts(me, { claim: false });
  revalidatePath("/invoices");
  redirect(`/invoices?drafts=${r.invoices}&unpriced=${r.unpriced}&label=${encodeURIComponent(r.label)}`);
}

export async function checkWaveNow() {
  const me = await requireUser("MANAGER");
  const r = await syncWavePaid(me);
  revalidatePath("/invoices");
  redirect(r.skipped ? "/invoices?wave=off" : `/invoices?wave=${r.paid}`);
}
