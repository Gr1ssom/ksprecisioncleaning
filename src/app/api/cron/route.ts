import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { admin, must } from "@/lib/supabase/server";
import { leads, notify } from "@/lib/notify";
import { getRules } from "@/lib/settings";
import { fromLocalInput, today } from "@/lib/format";
import type { Assignment, Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Called by the database every 5 minutes (pg_cron, see the Phase 2 migration) with a key only the
 * database and this server know. Sends reminders before jobs and "not checked in" alerts. Each
 * alert has a dedupe key, so running again never repeats one.
 */
export async function POST(req: Request) {
  const sb = admin();
  const row = must(await sb.from("AppSecret").select("value").eq("key", "cron").maybeSingle(), "cron key") as { value: string } | null;
  const given = Buffer.from(req.headers.get("x-cron-key") ?? "");
  const want = Buffer.from(row?.value ?? "");
  if (!row || given.length !== want.length || !timingSafeEqual(given, want)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await getRules();
  const now = Date.now();
  const jobs = must(await sb.from("Assignment").select("id, userId, date, startTime, status, location:Location(name)")
    .eq("date", today()).eq("status", "SCHEDULED"), "jobs") as unknown as (Assignment & { location: { name: string } })[];
  const managers = await leads(rules.lateAlertTo);
  let reminders = 0, late = 0, long = 0;

  for (const j of jobs) {
    const start = fromLocalInput(`${j.date}T${j.startTime}`).getTime();
    const mins = (start - now) / 60000;
    if (j.userId && mins > 0 && mins <= 35) {
      reminders++;
      await notify([j.userId], { kind: "reminder", title: `Job at ${j.startTime}: ${j.location.name}`, body: "Starts in about 30 minutes.", url: `/jobs/${j.id}`, dedupe: `remind:${j.id}` });
    }
    // Late: past start + grace, but not hours later (no alerts for long-past jobs).
    if (mins <= -rules.lateMinutes && mins > -6 * 60) {
      late++;
      if (j.userId) {
        await notify([j.userId], { kind: "late", title: `You haven't checked in at ${j.location.name}`, body: `It started at ${j.startTime}. Check in when you arrive.`, url: `/jobs/${j.id}`, dedupe: `late:${j.id}` });
        await notify(managers.filter((id) => id !== j.userId), { kind: "late", title: `Not checked in: ${j.location.name}`, body: `Started at ${j.startTime}, no check-in yet.`, url: `/jobs/${j.id}`, dedupe: `late:${j.id}` });
      } else {
        await notify(managers, { kind: "late", title: `Open shift not covered: ${j.location.name}`, body: `Started at ${j.startTime} with nobody assigned.`, url: `/jobs/${j.id}`, dedupe: `late:${j.id}` });
      }
    }
  }

  // Forgot to end the day: a nudge after 12 hours on the clock.
  const open = must(await sb.from("Shift").select("id, userId, clockIn").is("clockOut", null).lt("clockIn", new Date(now - 12 * 3600_000).toISOString()), "open days") as Pick<Shift, "id" | "userId" | "clockIn">[];
  for (const s of open) {
    long++;
    await notify([s.userId], { kind: "long_shift", title: "Still working?", body: "You've been on the clock for 12+ hours. End your day if you're done.", url: "/dashboard", dedupe: `long:${s.id}` });
  }
  return NextResponse.json({ ok: true, reminders, late, long });
}
