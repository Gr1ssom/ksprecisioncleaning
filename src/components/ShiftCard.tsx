import { Coffee, Sun } from "lucide-react";
import { clockShift } from "@/app/actions/field";
import { GeoForm } from "./GeoForm";
import { BreakButton } from "./BreakButton";
import { clockState, weekHours } from "@/lib/work";
import { getRules } from "@/lib/settings";
import { admin, must } from "@/lib/supabase/server";
import { fmtTime, hoursBetween } from "@/lib/format";

/**
 * The shift clock: start and end the working day, take breaks. The day also starts by itself at
 * the first supply pickup or site check-in, so drive time and supply runs are on the clock.
 */
export async function ShiftCard({ userId, back }: { userId: string; back: string }) {
  const [{ shift, onBreak }, hours, rules] = await Promise.all([clockState(userId), weekHours([userId]), getRules()]);
  const week = hours[userId] ?? 0;
  const nearOT = week >= rules.overtimeHours - 4;
  let breakHint = false;
  if (shift && !onBreak && rules.breakAfterHours > 0 && hoursBetween(shift.clockIn, new Date()) >= rules.breakAfterHours) {
    const taken = must(await admin().from("Break").select("id").eq("shiftId", shift.id).limit(1), "breaks") as unknown[];
    breakHint = taken.length === 0;
  }
  return (
    <div className={`card ${shift ? (onBreak ? "border-amber-300" : "border-emerald-300") : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">{shift ? (onBreak ? "On a break" : "On the clock") : "Your day"}</div>
          <div className="mt-0.5 text-lg font-semibold">
            {shift ? <>Since {fmtTime(shift.clockIn)}{onBreak && <span className="text-base font-normal text-slate-500"> · break since {fmtTime(onBreak.startedAt)}</span>}</> : "Not started"}
          </div>
          <div className={`text-sm ${nearOT ? "font-semibold text-amber-600" : "text-slate-500"}`}>
            {week.toFixed(1)} h this week{nearOT && ` · overtime after ${rules.overtimeHours} h`}
          </div>
        </div>
      </div>
      {breakHint && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800"><Coffee className="mr-1 inline h-4 w-4 align-[-3px]" />You&apos;ve worked {rules.breakAfterHours}+ hours. Time for a break.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {!shift ? (
          <div className="sm:col-span-2">
            <GeoForm action={clockShift} submitLabel="Start my day" className="btn-success w-full" offline="clockIn">
              <input type="hidden" name="on" value="1" /><input type="hidden" name="back" value={back} />
            </GeoForm>
            <p className="mt-2 text-xs text-slate-500"><Sun className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />It also starts by itself at your first pickup or check-in.</p>
          </div>
        ) : (
          <>
            <BreakButton onBreak={!!onBreak} />
            <GeoForm action={clockShift} submitLabel="End my day" className="btn-danger w-full" offline="clockOut">
              <input type="hidden" name="on" value="0" /><input type="hidden" name="back" value={back} />
            </GeoForm>
          </>
        )}
      </div>
    </div>
  );
}
