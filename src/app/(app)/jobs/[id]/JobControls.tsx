"use client";
import { useOptimistic, useTransition } from "react";
import { toggleTask } from "@/app/actions/field";
import { setAssignmentStatus } from "@/app/actions/manage";
import type { Task } from "@/lib/format";

export function TaskList({ id, tasks, canWork }: { id: string; tasks: Task[]; canWork: boolean }) {
  const [, start] = useTransition();
  const [opt, flip] = useOptimistic(tasks, (cur: Task[], i: number) => cur.map((t, j) => (j === i ? { ...t, done: !t.done } : t)));
  return (
    <div className="card space-y-1">
      {opt.map((t, i) => (
        <label key={i} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={t.done} disabled={!canWork} onChange={() => start(async () => { flip(i); await toggleTask(id, i); })} />
          <span className={t.done ? "text-slate-400 line-through" : ""}>{t.label}</span>
        </label>
      ))}
    </div>
  );
}

export function StatusButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const set = (s: "SCHEDULED" | "CANCELLED" | "MISSED" | "COMPLETED") => start(() => setAssignmentStatus(id, s));
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      {status !== "COMPLETED" && <button disabled={pending} className="btn-secondary text-xs" onClick={() => set("COMPLETED")}>Mark complete</button>}
      {status !== "MISSED" && status !== "COMPLETED" && <button disabled={pending} className="btn-secondary text-xs" onClick={() => set("MISSED")}>Mark missed</button>}
      {status !== "CANCELLED" && status !== "COMPLETED" && <button disabled={pending} className="btn-secondary text-xs" onClick={() => set("CANCELLED")}>Cancel</button>}
      {status !== "SCHEDULED" && <button disabled={pending} className="btn-secondary text-xs" onClick={() => set("SCHEDULED")}>Reopen</button>}
    </div>
  );
}
