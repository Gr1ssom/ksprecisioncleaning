"use client";
import { Play, Square, StickyNote } from "lucide-react";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { FloorPlan } from "@/components/FloorPlan";
import { startRoom, stopRoom, toggleRoomTask } from "@/app/actions/field";

export type MapRoom = { id: string; name: string; type: string; points: number[][]; color: string; tasks: { label: string; custom: boolean }[]; notes: string | null };
export type MapLayout = { id: string; name: string; imageData: string | null; aspect: number; rooms: MapRoom[] };

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, "0")}`;
};

export function RoomMap({ assignmentId, layouts, checks, spentSec, active, canWork }: {
  assignmentId: string; layouts: MapLayout[]; checks: string[];
  spentSec: Record<string, number>; // closed sessions total per room
  active: { roomId: string; startedAt: string } | null; canWork: boolean;
}) {
  const [layoutIdx, setLayoutIdx] = useState(0);
  const layout = layouts[layoutIdx];
  const [selected, setSelected] = useState<string | null>(active?.roomId ?? null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const [optChecks, toggleOpt] = useOptimistic(checks, (cur: string[], key: string) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const [optActive, setOptActive] = useOptimistic(active, (_: typeof active, next: typeof active) => next);
  const checked = useMemo(() => new Set(optChecks), [optChecks]);

  const total = (roomId: string) => (spentSec[roomId] ?? 0) + (optActive?.roomId === roomId ? Math.max(0, now - new Date(optActive.startedAt).getTime()) / 1000 : 0);
  const progress = (r: MapRoom) => ({ done: r.tasks.filter((t) => checked.has(`${r.id}|${t.label}`)).length, of: r.tasks.length });

  const room = layout?.rooms.find((r) => r.id === selected) ?? null;
  const allRooms = layouts.flatMap((l) => l.rooms);
  const doneRooms = allRooms.filter((r) => { const p = progress(r); return p.of > 0 && p.done === p.of; }).length;

  if (!layout) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {layouts.map((l, i) => (
              <button key={l.id} onClick={() => { setLayoutIdx(i); setSelected(null); }}
                className={`min-h-10 rounded-md px-4 text-sm font-semibold ${i === layoutIdx ? "bg-ink text-paper" : "bg-surface text-slate-600 border border-slate-200"}`}>{l.name}</button>
            ))}
          </div>
          <div className="text-xs text-slate-500">{doneRooms}/{allRooms.length} rooms done · tap a room</div>
        </div>
        <FloorPlan
          imageData={layout.imageData} aspect={layout.aspect} rooms={layout.rooms} selectedId={selected}
          onRoomClick={setSelected}
          fill={(r) => {
            const mr = r as MapRoom; const p = progress(mr); const t = total(r.id);
            const isActive = optActive?.roomId === r.id;
            const badge = isActive ? `● ${fmtDur(t)}` : p.of && p.done === p.of ? "✓ done" : p.done ? `${p.done}/${p.of}` : t > 0 ? fmtDur(t) : undefined;
            if (isActive) return { fill: "#2563eb", opacity: 0.55, pulse: true, badge };
            if (p.of && p.done === p.of) return { fill: "#16a34a", opacity: 0.5, badge };
            if (p.done || t > 0) return { fill: "#f59e0b", opacity: 0.45, badge };
            return { fill: r.color, opacity: 0.2, badge };
          }}
        />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" /> in progress</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> started</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" /> done</span>
        </div>
      </div>

      <div className="card h-fit lg:sticky lg:top-4">
        {!room ? (
          <div className="py-6 text-center text-sm text-slate-500">Select a room on the map to see its tasks{canWork ? " and start the timer" : ""}.</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{room.name}</div>
                <div className="text-xs text-slate-500">{room.type} · {progress(room).done}/{progress(room).of} tasks · {fmtDur(total(room.id))} spent</div>
              </div>
              <span className="mt-1 h-3 w-3 rounded-full" style={{ background: room.color }} />
            </div>
            {room.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><StickyNote className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{room.notes}</p>}
            {canWork && (
              <div className="mt-3">
                {optActive?.roomId === room.id ? (
                  <button disabled={pending} onClick={() => start(async () => { setOptActive(null); await stopRoom(assignmentId); })} className="btn-danger w-full text-base"><Square className="h-4 w-4 fill-current" /> Stop · {fmtDur(total(room.id))}</button>
                ) : (
                  <button disabled={pending} onClick={() => start(async () => { setOptActive({ roomId: room.id, startedAt: new Date().toISOString() }); await startRoom(assignmentId, room.id); })} className="btn-success w-full text-base">
                    <Play className="h-4 w-4 fill-current" /> {optActive ? "Switch to this room" : "Start room"}
                  </button>
                )}
              </div>
            )}
            <ul className="mt-4 space-y-1">
              {room.tasks.map((t) => {
                const on = checked.has(`${room.id}|${t.label}`);
                return (
                  <li key={t.label}>
                    <label className={`flex min-h-12 items-start gap-3 rounded-lg px-2 py-3 text-base md:min-h-0 md:py-2 md:text-sm ${canWork ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                      <input type="checkbox" className="mt-0.5 h-6 w-6 accent-emerald-600 md:h-5 md:w-5" checked={on} disabled={!canWork}
                        onChange={() => start(async () => { toggleOpt(`${room.id}|${t.label}`); await toggleRoomTask(assignmentId, room.id, t.label); })} />
                      <span className={on ? "text-slate-400 line-through" : ""}>{t.label}{t.custom && <span className="badge ml-2 bg-purple-100 text-purple-700">this room</span>}</span>
                    </label>
                  </li>
                );
              })}
              {room.tasks.length === 0 && <li className="text-sm text-slate-500">No tasks set for this room type yet.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
