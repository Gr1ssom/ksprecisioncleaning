"use client";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Camera, CheckCheck, ChevronRight, Play, Square, StickyNote } from "lucide-react";
import { FloorPlan } from "@/components/FloorPlan";
import { ZoomPan } from "@/components/ZoomPan";
import { roomIcon } from "@/components/roomIcons";
import { addRoomPhoto, finishRoom, startRoom, stopRoom, toggleRoomTask } from "@/app/actions/field";
import type { PlanLayout } from "@/lib/rooms";

type Photo = { id: string; kind: "before" | "after"; url: string };

const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : `${m}:${String(s).padStart(2, "0")}`;
};

export function RoomMap({ assignmentId, layouts, checks, spentSec, active, canWork, usual, photos }: {
  assignmentId: string; layouts: PlanLayout[]; checks: string[];
  spentSec: Record<string, number>; // closed timer seconds per room
  active: { roomId: string; startedAt: string } | null; canWork: boolean;
  usual: Record<string, number>; // average minutes per visit, from history
  photos: Record<string, Photo[]>;
}) {
  const route = useMemo(() => layouts.flatMap((l) => l.rooms.map((r) => ({ ...r, layoutId: l.id }))), [layouts]);
  const [optChecks, toggleOpt] = useOptimistic(checks, (cur: string[], keys: string[]) =>
    keys.length === 1 ? (cur.includes(keys[0]) ? cur.filter((k) => k !== keys[0]) : [...cur, keys[0]]) : [...new Set([...cur, ...keys])]);
  const [optActive, setOptActive] = useOptimistic(active, (_: typeof active, next: typeof active) => next);
  const checked = useMemo(() => new Set(optChecks), [optChecks]);
  const progress = (r: (typeof route)[number]) => ({ done: r.tasks.filter((t) => checked.has(`${r.id}|${t.label}`)).length, of: r.tasks.length });
  const isDone = (r: (typeof route)[number]) => { const p = progress(r); return p.of > 0 && p.done === p.of; };
  const nextRoom = route.find((r) => !isDone(r)) ?? null;

  const [selected, setSelected] = useState<string | null>(active?.roomId ?? nextRoom?.id ?? null);
  const room = route.find((r) => r.id === selected) ?? null;
  const [layoutId, setLayoutId] = useState(room?.layoutId ?? layouts[0]?.id);
  useEffect(() => { if (room && room.layoutId !== layoutId) setLayoutId(room.layoutId); }, [room, layoutId]);
  const layout = layouts.find((l) => l.id === layoutId) ?? layouts[0];
  const panel = useRef<HTMLDivElement>(null);

  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const total = (roomId: string) => (spentSec[roomId] ?? 0) + (optActive?.roomId === roomId ? Math.max(0, now - new Date(optActive.startedAt).getTime()) / 1000 : 0);

  const allTasks = route.reduce((s, r) => s + r.tasks.length, 0);
  const allDone = route.reduce((s, r) => s + progress(r).done, 0);
  const roomsDone = route.filter(isDone).length;
  const order = Object.fromEntries(route.map((r, i) => [r.id, i + 1]));

  const pick = (id: string) => { setSelected(id); setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); };
  const startHere = (id: string) => start(async () => { setOptActive({ roomId: id, startedAt: new Date().toISOString() }); await startRoom(assignmentId, id); });
  const finish = (r: (typeof route)[number]) => start(async () => {
    const remaining = r.tasks.filter((t) => !checked.has(`${r.id}|${t.label}`)).map((t) => t.label);
    // All remaining are unticked, so this ticks them (one key toggles, several are added).
    toggleOpt(remaining.map((l) => `${r.id}|${l}`));
    const wasTiming = optActive?.roomId === r.id;
    if (wasTiming) setOptActive(null);
    await finishRoom(assignmentId, r.id, remaining);
    if (wasTiming) await stopRoom(assignmentId);
    const after = route.find((x) => x.id !== r.id && !isDone(x));
    if (after) setSelected(after.id);
  });

  if (!layout) return null;
  const sec = room ? total(room.id) : 0;
  const typical = room ? usual[room.id] : undefined;
  const over = room && typical ? sec / 60 > typical * 1.25 : false;
  const RoomIcon = room ? roomIcon(room.type) : null;

  return (
    <div className="space-y-3">
      {/* Progress + next room */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-40 flex-1">
          <div className="flex justify-between text-xs text-slate-500"><span>{roomsDone}/{route.length} rooms</span><span>{allDone}/{allTasks} tasks</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${allTasks ? (allDone / allTasks) * 100 : 0}%` }} /></div>
        </div>
        {nextRoom && nextRoom.id !== selected && (
          <button type="button" onClick={() => pick(nextRoom.id)} className="btn-secondary">Next: {order[nextRoom.id]}. {nextRoom.name}<ChevronRight className="h-4 w-4" /></button>
        )}
        {!nextRoom && route.length > 0 && <span className="badge bg-emerald-100 text-emerald-700">All rooms done</span>}
      </div>

      {/* Route strip */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {route.map((r) => {
          const p = progress(r), on = optActive?.roomId === r.id, done = isDone(r);
          return (
            <button key={r.id} type="button" onClick={() => pick(r.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${selected === r.id ? "border-ink bg-ink text-paper" : "border-slate-300 bg-surface text-slate-700"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white ${done ? "bg-emerald-600" : on ? "animate-pulse bg-blue-600" : p.done ? "bg-amber-500" : "bg-slate-400"}`}>{done ? "✓" : order[r.id]}</span>
              {r.name}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {layouts.length > 1 && (
            <div className="mb-2 flex gap-1">
              {layouts.map((l) => (
                <button key={l.id} type="button" onClick={() => setLayoutId(l.id)} className={`chip ${l.id === layout.id ? "bg-ink text-paper" : "border border-slate-300 bg-surface text-slate-600"}`}>{l.name}</button>
              ))}
            </div>
          )}
          <ZoomPan panOneFinger>
            <FloorPlan
              imageUrl={layout.imageUrl} aspect={layout.aspect} rooms={layout.rooms} selectedId={selected} order={order}
              onRoomClick={pick}
              fill={(r) => {
                const mr = route.find((x) => x.id === r.id)!; const p = progress(mr); const t = total(r.id);
                const on = optActive?.roomId === r.id;
                const badge = on ? `● ${fmtDur(t)}` : p.of && p.done === p.of ? "✓ done" : p.done ? `${p.done}/${p.of}` : t > 0 ? fmtDur(t) : undefined;
                if (on) return { fill: "#2563eb", opacity: 0.5, pulse: true, badge };
                if (p.of && p.done === p.of) return { fill: "#16a34a", opacity: 0.45, badge };
                if (p.done || t > 0) return { fill: "#f59e0b", opacity: 0.4, badge };
                return { fill: r.color, opacity: 0.15, badge };
              }}
            />
          </ZoomPan>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" /> timing</span>
            <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> started</span>
            <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" /> done</span>
            <span>Pinch or use +/− to zoom</span>
          </div>
        </div>

        <div ref={panel} className="card h-fit scroll-mt-20 lg:sticky lg:top-4">
          {!room ? (
            <div className="py-6 text-center text-sm text-slate-500">Tap a room to see its tasks{canWork ? " and start the timer" : ""}.</div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: room.color }}>{RoomIcon && <RoomIcon className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-xl font-black leading-tight">{order[room.id]}. {room.name}</div>
                  <div className="text-xs text-slate-500">{room.type} · {progress(room).done}/{progress(room).of} tasks</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className={`rounded-lg p-2 ${over ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}><div className="eyebrow text-[9px]">This visit</div><div className="font-serif text-lg font-black tabular-nums">{fmtDur(sec)}</div></div>
                <div className="rounded-lg bg-slate-100 p-2"><div className="eyebrow text-[9px]">Usual</div><div className="font-serif text-lg font-black">{typical ? `${typical}m` : "—"}</div></div>
                <div className="rounded-lg bg-slate-100 p-2"><div className="eyebrow text-[9px]">Estimate</div><div className="font-serif text-lg font-black">{room.estMinutes ? `${room.estMinutes}m` : "—"}</div></div>
              </div>
              {room.notes && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800"><StickyNote className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{room.notes}</p>}
              {canWork && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {optActive?.roomId === room.id ? (
                    <button type="button" disabled={pending} onClick={() => start(async () => { setOptActive(null); await stopRoom(assignmentId); })} className="btn-danger"><Square className="h-4 w-4 fill-current" />Stop</button>
                  ) : (
                    <button type="button" disabled={pending} onClick={() => startHere(room.id)} className="btn-success"><Play className="h-4 w-4 fill-current" />{optActive ? "Switch here" : "Start"}</button>
                  )}
                  <button type="button" disabled={pending || isDone(room)} onClick={() => finish(room)} className="btn-secondary"><CheckCheck className="h-4 w-4" />Finish room</button>
                </div>
              )}
              <ul className="mt-3 divide-y divide-slate-100">
                {room.tasks.map((t) => {
                  const key = `${room.id}|${t.label}`, on = checked.has(key);
                  return (
                    <li key={t.label}>
                      <label className={`flex min-h-12 items-start gap-3 py-3 text-base md:min-h-0 md:py-2 md:text-sm ${canWork ? "cursor-pointer" : ""}`}>
                        <input type="checkbox" className="mt-0.5 h-6 w-6 accent-emerald-600 md:h-5 md:w-5" checked={on} disabled={!canWork}
                          onChange={() => start(async () => { toggleOpt([key]); await toggleRoomTask(assignmentId, room.id, t.label); })} />
                        <span className={`flex-1 ${on ? "text-slate-400 line-through" : ""}`}>
                          {t.label}{t.custom && <span className="badge ml-2 bg-purple-100 text-purple-800">this room</span>}
                        </span>
                        {t.minutes ? <span className="text-xs text-slate-400">{t.minutes}m</span> : null}
                      </label>
                    </li>
                  );
                })}
                {room.tasks.length === 0 && <li className="py-2 text-sm text-slate-500">No tasks for this room on this service.</li>}
              </ul>

              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="eyebrow mb-2">Photos</div>
                <div className="flex flex-wrap gap-2">
                  {(photos[room.id] ?? []).map((ph) => (
                    <a key={ph.id} href={ph.url} target="_blank" rel="noreferrer" className="relative">
                      <img src={ph.url} alt={`${ph.kind} photo`} className="h-16 w-16 rounded-md object-cover" />
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] font-semibold uppercase text-white">{ph.kind}</span>
                    </a>
                  ))}
                </div>
                {canWork && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["before", "after"] as const).map((kind) => (
                      <form key={kind} action={addRoomPhoto}>
                        <input type="hidden" name="assignmentId" value={assignmentId} />
                        <input type="hidden" name="roomId" value={room.id} />
                        <input type="hidden" name="kind" value={kind} />
                        <label className="btn-secondary w-full capitalize">
                          <Camera className="h-4 w-4" />{kind}
                          <input type="file" name="photo" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
                        </label>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
