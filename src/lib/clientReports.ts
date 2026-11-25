import "server-only";
import { randomBytes } from "node:crypto";
import { admin, must } from "./supabase/server";
import { baseUrl, emailConfigured, linkEmail, sendEmail } from "./email";
import { leads, notify } from "./notify";
import { layoutsWithTasks } from "./rooms";
import { signedUrls } from "./storage";
import { fmtDate, today } from "./format";
import type { Assignment, Checkin, Client, Location, RoomPhoto, RoomSession, RoomTaskCheck, VisitFeedback, VisitReport } from "./types";

/** A fresh unguessable token for a link that opens without signing in. */
export const newToken = () => randomBytes(24).toString("base64url");

/** The job's client report row (made on first use). */
export async function ensureReport(assignmentId: string): Promise<VisitReport> {
  const sb = admin();
  await sb.from("VisitReport").upsert({ assignmentId, token: newToken() }, { onConflict: "assignmentId", ignoreDuplicates: true });
  return must(await sb.from("VisitReport").select("*").eq("assignmentId", assignmentId).single(), "visit report") as VisitReport;
}

type JobWithClient = Assignment & { location: Location & { client: Client | null } };
async function jobWithClient(assignmentId: string) {
  return must(await admin().from("Assignment").select("*, location:Location(*, client:Client(*))").eq("id", assignmentId).single(), "job") as JobWithClient;
}
export const reportRecipient = (c: Pick<Client, "reportEmail" | "email"> | null) => c?.reportEmail || c?.email || null;

/** Email the client their visit report. Returns an error to show, or null. Errors are kept on the report. */
export async function emailVisitReport(assignmentId: string): Promise<string | null> {
  const a = await jobWithClient(assignmentId);
  const to = reportRecipient(a.location.client);
  if (!emailConfigured()) return "Email isn't set up yet. Copy or text the link instead.";
  if (!to) return "This client has no report email or billing email. Add one on the Clients page.";
  const r = await ensureReport(assignmentId);
  const url = `${await baseUrl()}/r/${r.token}`;
  try {
    const mail = linkEmail({
      greeting: `Hi ${a.location.client?.contactName ?? a.location.client?.name ?? "there"},`,
      lines: [`Your ${fmtDate(a.date)} visit at ${a.location.name} is done. See the rooms cleaned, before and after photos and the cleaner's note in your visit report.`, "It takes one tap to tell us how we did."],
      button: "View visit report", url,
    });
    await sendEmail({ to, subject: `Visit report: ${a.location.name}, ${fmtDate(a.date)}`, ...mail });
    must(await admin().from("VisitReport").update({ sentAt: new Date().toISOString(), sentTo: to, emailError: null }).eq("id", r.id), "mark report sent");
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    await admin().from("VisitReport").update({ emailError: msg }).eq("id", r.id);
    return msg;
  }
}

/**
 * After a check-out: if the client gets visit reports, make the report and email it, or (no email
 * sender yet) tell managers it's ready to send by hand. Never throws: check-out must not fail.
 */
export async function afterCheckOut(assignmentId: string) {
  try {
    const a = await jobWithClient(assignmentId);
    if (!a.location.client?.reportsEnabled) return;
    const r = await ensureReport(assignmentId);
    if (r.sentAt) return; // already emailed (checked out again after a re-open)
    const err = emailConfigured() && reportRecipient(a.location.client) ? await emailVisitReport(assignmentId) : "not sent";
    if (err) {
      await notify(await leads("both"), {
        kind: "report", title: `Visit report ready: ${a.location.name}`,
        body: emailConfigured() ? `It wasn't emailed: ${err}` : "Email isn't set up yet, so copy or text the link to the client.",
        url: `/jobs/${assignmentId}`, dedupe: `report:${assignmentId}`,
      });
    }
  } catch (e) {
    console.error("visit report after check-out failed", e);
  }
}

export type ReportRoom = { id: string; name: string; tasksDone: number; tasks: number; minutes: number; photos: { kind: "before" | "after"; url: string }[] };
export type PublicReport = {
  token: string; assignmentId: string; status: string; date: string; locationName: string; clientName: string | null;
  service: string | null; cleaner: string | null; arrived: string | null; left: string | null; note: string | null;
  rooms: ReportRoom[]; checklist: { label: string; done: boolean }[]; feedback: Pick<VisitFeedback, "rating" | "comment"> | null;
};

/**
 * Everything a client may see about one visit, found by the report token. Nothing else: no other
 * visits, no staff details beyond the cleaner's first name, photos only as short-lived signed links.
 */
export async function loadReport(token: string): Promise<PublicReport | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const sb = admin();
  const rep = must(await sb.from("VisitReport").select("assignmentId").eq("token", token).maybeSingle(), "report") as { assignmentId: string } | null;
  if (!rep) return null;
  const a = must(await sb.from("Assignment").select(`*, location:Location(name, client:Client(name)), user:User!Assignment_userId_fkey(name), serviceType:ServiceType(name),
      checkins:Checkin(type, at, note), roomSessions:RoomSession(roomId, startedAt, endedAt), roomChecks:RoomTaskCheck(roomId, label), roomPhotos:RoomPhoto(roomId, kind, path, createdAt),
      feedback:VisitFeedback(rating, comment)`).eq("id", rep.assignmentId).single(), "visit") as Assignment & {
    location: { name: string; client: { name: string } | null }; user: { name: string } | null; serviceType: { name: string } | null;
    checkins: Pick<Checkin, "type" | "at" | "note">[]; roomSessions: Pick<RoomSession, "roomId" | "startedAt" | "endedAt">[];
    roomChecks: Pick<RoomTaskCheck, "roomId" | "label">[]; roomPhotos: Pick<RoomPhoto, "roomId" | "kind" | "path" | "createdAt">[];
    feedback: Pick<VisitFeedback, "rating" | "comment"> | Pick<VisitFeedback, "rating" | "comment">[] | null;
  };
  const layouts = await layoutsWithTasks(a.locationId, a.serviceTypeId);
  const urls = await signedUrls(a.roomPhotos.map((p) => p.path), 6 * 3600);
  const ins = a.checkins.filter((c) => c.type === "SITE_IN").sort((x, y) => x.at.localeCompare(y.at));
  const outs = a.checkins.filter((c) => c.type === "SITE_OUT").sort((x, y) => x.at.localeCompare(y.at));
  const rooms: ReportRoom[] = layouts.flatMap((l) => l.rooms).map((r) => {
    const ms = a.roomSessions.filter((s) => s.roomId === r.id && s.endedAt).reduce((s, x) => s + (Date.parse(x.endedAt!) - Date.parse(x.startedAt)), 0);
    const done = new Set(a.roomChecks.filter((c) => c.roomId === r.id).map((c) => c.label));
    return {
      id: r.id, name: r.name, tasks: r.tasks.length, tasksDone: r.tasks.filter((t) => done.has(t.label)).length, minutes: Math.round(ms / 60000),
      photos: a.roomPhotos.filter((p) => p.roomId === r.id && urls[p.path]).sort((x, y) => x.createdAt.localeCompare(y.createdAt)).map((p) => ({ kind: p.kind, url: urls[p.path] })),
    };
  }).filter((r) => r.tasksDone || r.minutes || r.photos.length);
  const fb = Array.isArray(a.feedback) ? a.feedback[0] ?? null : a.feedback;
  return {
    token, assignmentId: a.id, status: a.status, date: a.date, locationName: a.location.name, clientName: a.location.client?.name ?? null,
    service: a.serviceType?.name ?? null, cleaner: a.user?.name.split(" ")[0] ?? null,
    arrived: ins[0]?.at ?? null, left: outs.at(-1)?.at ?? null, note: outs.at(-1)?.note ?? null,
    rooms, checklist: a.tasks ?? [], feedback: fb,
  };
}

export type Portal = {
  clientName: string;
  upcoming: { id: string; date: string; startTime: string; location: string; service: string | null }[];
  past: { id: string; date: string; location: string; service: string | null; reportToken: string | null; rating: number | null }[];
  invoices: { id: string; number: string; issueDate: string; dueDate: string; total: number; status: string; viewUrl: string | null }[];
};

/** A client's read-only portal, found by its token: their visits, reports and sent invoices only. */
export async function loadPortal(token: string): Promise<Portal | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const sb = admin();
  const c = must(await sb.from("Client").select("id, name, locations:Location(id)").eq("portalToken", token).maybeSingle(), "client") as { id: string; name: string; locations: { id: string }[] } | null;
  if (!c) return null;
  const locIds = c.locations.map((l) => l.id);
  type Row = Pick<Assignment, "id" | "date" | "startTime" | "status"> & { location: { name: string }; serviceType: { name: string } | null; report: { token: string }[] | { token: string } | null; feedback: { rating: number }[] | { rating: number } | null };
  const one = <T,>(v: T[] | T | null) => (Array.isArray(v) ? v[0] ?? null : v);
  const [up, past, inv] = locIds.length ? await Promise.all([
    sb.from("Assignment").select("id, date, startTime, status, location:Location(name), serviceType:ServiceType(name), report:VisitReport(token), feedback:VisitFeedback(rating)")
      .in("locationId", locIds).gte("date", today()).in("status", ["SCHEDULED", "IN_PROGRESS"]).order("date").order("startTime").limit(30),
    sb.from("Assignment").select("id, date, startTime, status, location:Location(name), serviceType:ServiceType(name), report:VisitReport(token), feedback:VisitFeedback(rating)")
      .in("locationId", locIds).eq("status", "COMPLETED").gte("date", today(-180)).order("date", { ascending: false }).limit(60),
    sb.from("Invoice").select("id, number, issueDate, dueDate, total, status, waveViewUrl").eq("clientId", c.id).in("status", ["SENT", "PAID"]).order("issueDate", { ascending: false }).limit(36),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  return {
    clientName: c.name,
    upcoming: (must(up, "upcoming visits") as unknown as Row[]).map((a) => ({ id: a.id, date: a.date, startTime: a.startTime, location: a.location.name, service: a.serviceType?.name ?? null })),
    past: (must(past, "past visits") as unknown as Row[]).map((a) => ({ id: a.id, date: a.date, location: a.location.name, service: a.serviceType?.name ?? null, reportToken: one(a.report)?.token ?? null, rating: one(a.feedback)?.rating ?? null })),
    invoices: (must(inv, "invoices") as { id: string; number: string; issueDate: string; dueDate: string; total: number; status: string; waveViewUrl: string | null }[]).map((i) => ({ ...i, total: Number(i.total), viewUrl: i.waveViewUrl })),
  };
}
