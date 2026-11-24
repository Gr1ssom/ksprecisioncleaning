"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldOp } from "@/lib/offline";
import { useSynced } from "@/components/useSynced";
import { useOfflineStart } from "@/components/useOfflineStart";
import { setAssignmentStatus } from "@/app/actions/manage";
import type { Task } from "@/lib/format";

export function TaskList({ id, tasks, canWork: serverCanWork, canStart = false }: { id: string; tasks: Task[]; canWork: boolean; canStart?: boolean }) {
  const canWork = useOfflineStart(id, canStart) || serverCanWork;
  const [, start] = useTransition();
  const router = useRouter();
  // Shown at once and kept on the phone if there's no signal.
  const [opt, setOpt] = useSynced(tasks);
  const flip = (i: number) => start(async () => {
    const done = !opt[i].done;
    setOpt(opt.map((t, j) => (j === i ? { ...t, done } : t)));
    const r = await fieldOp({ op: "setTask", assignmentId: id, index: i, done });
    if (!("queued" in r)) router.refresh();
  });
  return (
    <div className="card space-y-1">
      {opt.map((t, i) => (
        <label key={i} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-3 text-base hover:bg-slate-50 md:min-h-0 md:py-2 md:text-sm">
          <input type="checkbox" className="h-6 w-6 accent-emerald-600 md:h-5 md:w-5" checked={t.done} disabled={!canWork} onChange={() => flip(i)} />
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
