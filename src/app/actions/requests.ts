"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { leads, notify } from "@/lib/notify";
import { fmtDate, today } from "@/lib/format";
import type { Assignment, ShiftClaim, TimeOff } from "@/lib/types";

const s = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);
const refresh = () => revalidatePath("/", "layout");
const when = (j: Pick<Assignment, "date" | "startTime">) => `${fmtDate(j.date)} at ${j.startTime}`;

// ---------- Open shifts ----------
/** Staff ask for an open shift; managers approve. */
export async function claimShift(assignmentId: string) {
  const me = await requireUser();
  const sb = admin();
  const job = must(await sb.from("Assignment").select("id, userId, status, date, startTime, location:Location(name)").eq("id", assignmentId).single(), "job") as unknown as Assignment & { location: { name: string } };
  if (job.userId || job.status !== "SCHEDULED") redirect(`/jobs/${assignmentId}?error=${encodeURIComponent("This shift was already taken.")}`);
  const ins = await sb.from("ShiftClaim").insert({ assignmentId, userId: me.id });
  if (ins.error && ins.error.code !== "23505") throw ins.error; // 23505 = already asked
  await notify(await leads("both"), {
    kind: "claim", title: `${me.name} asked for an open shift`, body: `${job.location.name}, ${when(job)}.`, url: `/jobs/${assignmentId}`,
  });
  refresh();
}

export async function decideClaim(claimId: string, approve: boolean) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const c = must(await sb.from("ShiftClaim").select("*, user:User!ShiftClaim_userId_fkey(name), job:Assignment(id, userId, date, startTime, location:Location(name))").eq("id", claimId).single(), "request") as unknown as
    ShiftClaim & { user: { name: string }; job: Assignment & { location: { name: string } } };
  if (c.status !== "PENDING") return refresh();
  const decided = { decidedById: me.id, decidedAt: new Date().toISOString() };
  if (approve) {
    if (c.job.userId) {
      redirect(`/jobs/${c.assignmentId}?error=${encodeURIComponent("Someone already has this shift.")}`);
    }
    // Only if still open (two managers approving at once can't both win).
    const up = must(await sb.from("Assignment").update({ userId: c.userId }).eq("id", c.assignmentId).is("userId", null).select("id"), "assign") as unknown[];
    if (!up.length) redirect(`/jobs/${c.assignmentId}?error=${encodeURIComponent("Someone already has this shift.")}`);
    must(await sb.from("ShiftClaim").update({ status: "APPROVED", ...decided }).eq("id", claimId), "approve");
    // Everyone else who asked is told it's gone.
    const others = must(await sb.from("ShiftClaim").update({ status: "DENIED", ...decided }).eq("assignmentId", c.assignmentId).eq("status", "PENDING").select("userId"), "close others") as { userId: string }[];
    await notify([c.userId], { kind: "claim", title: "Shift approved", body: `${c.job.location.name}, ${when(c.job)} is yours.`, url: `/jobs/${c.assignmentId}` });
    await notify(others.map((o) => o.userId), { kind: "claim", title: "Shift taken", body: `${c.job.location.name}, ${when(c.job)} went to someone else.`, url: "/jobs" });
    await audit(me, "job.assign", "Assignment", c.assignmentId, `Gave the open shift at ${c.job.location.name} (${c.job.date}) to ${c.user.name}`, { after: { userId: c.userId } });
  } else {
    must(await sb.from("ShiftClaim").update({ status: "DENIED", ...decided }).eq("id", claimId), "deny");
    await notify([c.userId], { kind: "claim", title: "Shift request declined", body: `${c.job.location.name}, ${when(c.job)}.`, url: "/jobs" });
  }
  refresh();
}

// ---------- Time off ----------
export async function requestTimeOff(form: FormData) {
  const me = await requireUser();
  const startDate = String(form.get("startDate") ?? ""), endDate = String(form.get("endDate") || form.get("startDate") || "");
  const back = (msg: string) => redirect(`/timeoff?error=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) back("Pick the first and last day off.");
  if (endDate < startDate) back("The last day can't be before the first day.");
  if (startDate < today()) back("Pick today or a later day.");
  must(await admin().from("TimeOff").insert({ userId: me.id, startDate, endDate, reason: s(form, "reason") }), "request time off");
  const days = startDate === endDate ? fmtDate(startDate) : `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
  await notify((await leads("both")).filter((id) => id !== me.id), { kind: "timeoff", title: `${me.name} asked for time off`, body: days, url: "/requests" });
  refresh();
  redirect("/timeoff?sent=1");
}

export async function cancelTimeOff(id: string) {
  const me = await requireUser();
  must(await admin().from("TimeOff").update({ status: "CANCELLED" }).eq("id", id).eq("userId", me.id).in("status", ["PENDING", "APPROVED"]), "cancel");
  refresh();
}

export async function decideTimeOff(id: string, approve: boolean) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const t = must(await sb.from("TimeOff").select("*, user:User!TimeOff_userId_fkey(name)").eq("id", id).single(), "request") as TimeOff & { user: { name: string } };
  if (t.userId === me.id && me.role !== "OWNER") redirect(`/requests?error=${encodeURIComponent("Someone else has to approve your own time off.")}`);
  const status = approve ? "APPROVED" : "DENIED";
  must(await sb.from("TimeOff").update({ status, decidedById: me.id, decidedAt: new Date().toISOString() }).eq("id", id), "decide");
  const days = t.startDate === t.endDate ? fmtDate(t.startDate) : `${fmtDate(t.startDate)} – ${fmtDate(t.endDate)}`;
  await notify([t.userId], { kind: "timeoff", title: approve ? "Time off approved" : "Time off declined", body: days, url: "/timeoff" });
  await audit(me, `timeoff.${approve ? "approve" : "deny"}`, "TimeOff", id, `${approve ? "Approved" : "Declined"} ${t.user.name}'s time off (${days})`, { before: { status: t.status }, after: { status } });
  refresh();
}

// ---------- Availability ----------
/** The person's usual hours for each weekday (0 = Monday). A day left blank has no limits. */
export async function saveAvailability(form: FormData) {
  const me = await requireUser();
  const rows = Array.from({ length: 7 }, (_, d) => {
    const mode = String(form.get(`mode_${d}`) ?? "any");
    const startTime = s(form, `start_${d}`), endTime = s(form, `end_${d}`);
    return { userId: me.id, weekday: d, mode, startTime, endTime };
  });
  const bad = rows.find((r) => r.mode === "hours" && (!r.startTime || !r.endTime || r.endTime <= r.startTime));
  if (bad) redirect(`/timeoff?error=${encodeURIComponent(`Set a start and an end (end after start) for ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][bad.weekday]}.`)}`);
  const sb = admin();
  must(await sb.from("Availability").delete().eq("userId", me.id).in("weekday", rows.filter((r) => r.mode === "any").map((r) => r.weekday)), "clear days");
  const keep = rows.filter((r) => r.mode !== "any").map((r) => ({
    userId: r.userId, weekday: r.weekday, available: r.mode === "hours",
    startTime: r.mode === "hours" ? r.startTime : null, endTime: r.mode === "hours" ? r.endTime : null,
  }));
  if (keep.length) must(await sb.from("Availability").upsert(keep, { onConflict: "userId,weekday" }), "save availability");
  refresh();
  redirect("/timeoff?saved=1");
}
