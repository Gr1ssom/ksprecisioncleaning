import "server-only";
import { admin, must } from "./supabase/server";
import { audit } from "./audit";
import { fmtDate } from "./format";
import { leads, notify } from "./notify";
import { parseTemplate } from "./templates";

/**
 * Re-clean loop: a follow-up job at the same location, linked back to the job and the inspection
 * or issue behind it. Free by default (noCharge), so it never lands on an invoice. Tells the
 * assignee and the managers.
 */
export async function createFollowUp(actor: { id: string; name: string }, f: {
  locationId: string; date: string; userId: string | null; tasks: string[]; reason: string;
  followUpOfId?: string | null; inspectionId?: string | null; issueId?: string | null;
  serviceTypeId?: string | null; startTime?: string | null; charge?: boolean;
}) {
  const sb = admin();
  const loc = must(await sb.from("Location").select("name, jobTemplate").eq("id", f.locationId).single(), "location") as { name: string; jobTemplate: unknown };
  const tpl = parseTemplate(loc.jobTemplate);
  const orig = f.followUpOfId ? (must(await sb.from("Assignment").select("serviceTypeId, startTime, endTime").eq("id", f.followUpOfId).maybeSingle(), "original job") as { serviceTypeId: string | null; startTime: string; endTime: string | null } | null) : null;
  const row = {
    locationId: f.locationId, userId: f.userId, date: f.date, createdById: actor.id,
    serviceTypeId: f.serviceTypeId ?? orig?.serviceTypeId ?? tpl?.serviceTypeId ?? null,
    startTime: f.startTime || orig?.startTime || tpl?.startTime || "09:00",
    tasks: f.tasks.map((label) => ({ label, done: false })),
    notes: f.reason, followUpOfId: f.followUpOfId ?? null, inspectionId: f.inspectionId ?? null, issueId: f.issueId ?? null,
    noCharge: !f.charge,
  };
  const made = must(await sb.from("Assignment").insert(row).select("id").single(), "create re-clean") as { id: string };
  await audit(actor, "job.followup", "Assignment", made.id, `Re-clean at ${loc.name} on ${f.date}: ${f.reason}`, { after: { date: f.date, userId: f.userId, noCharge: row.noCharge } });
  const when = `${fmtDate(f.date)} at ${row.startTime}`;
  await notify([f.userId].filter((id) => id !== actor.id), { kind: "job", title: `Re-clean: ${loc.name}`, body: `${when}. ${f.reason}`, url: `/jobs/${made.id}` });
  await notify((await leads("both")).filter((id) => id !== actor.id), { kind: "followup", title: `Re-clean scheduled: ${loc.name}`, body: `${when}, by ${actor.name}. ${f.reason}`, url: `/jobs/${made.id}`, dedupe: `followup:${made.id}` });
  return made.id;
}
