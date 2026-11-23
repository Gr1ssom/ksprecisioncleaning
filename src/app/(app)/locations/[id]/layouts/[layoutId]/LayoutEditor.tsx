"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, Copy, ImagePlus, Magnet, MousePointer2, PenLine, Plus, RectangleHorizontal, Redo2, Trash2, Undo2, X,
  type LucideIcon,
} from "lucide-react";
import { FloorPlan, inside } from "@/components/FloorPlan";
import { ZoomPan, type ZoomPanHandle } from "@/components/ZoomPan";
import { roomIcon } from "@/components/roomIcons";
import { deleteLayout, saveLayout, type LayoutInput } from "@/app/actions/manage";
import type { TaskDef } from "@/lib/types";

type ERoom = { id?: string; key: string; name: string; type: string; points: number[][]; color: string; customTasks: TaskDef[]; notes: string | null };
type Mode = "select" | "polygon" | "rect";
type Common = { label: string; minutes: number | null; serviceTypeIds: string[] };
type Svc = { id: string; name: string };
type Drag =
  | { kind: "vertex"; key: string; idx: number }
  | { kind: "move"; key: string; start: number[]; orig: number[][]; moved: boolean };

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#0d9488", "#475569", "#9333ea", "#ea580c"];
const SNAP_R = 1.6; // % of canvas
let keySeq = 0;
const newKey = () => `new-${++keySeq}`;
const r1 = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 2) / 2;
const clone = (rs: ERoom[]) => rs.map((r) => ({ ...r, points: r.points.map((p) => [...p]), customTasks: r.customTasks.map((t) => ({ ...t, serviceTypeIds: [...t.serviceTypeIds] })) }));

function nearestOnSegment(p: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return [a[0] + t * dx, a[1] + t * dy];
}

export function LayoutEditor({ locationId, layout, roomTypes, commonTasks, services }: {
  locationId: string;
  layout: { id: string; name: string; imageUrl: string | null; aspect: number; rooms: Omit<ERoom, "key">[] };
  roomTypes: string[]; commonTasks: Record<string, Common[]>; services: Svc[];
}) {
  const router = useRouter();
  const canvas = useRef<HTMLDivElement>(null);
  const zoom = useRef<ZoomPanHandle>(null);
  const [name, setName] = useState(layout.name);
  const [image, setImage] = useState<LayoutInput["image"]>({ keep: true });
  const [preview, setPreview] = useState<string | null>(layout.imageUrl);
  const [aspect, setAspect] = useState(layout.aspect);
  const [rooms, setRooms] = useState<ERoom[]>(() => layout.rooms.map((r) => ({ ...r, key: r.id ?? newKey() })));
  const [past, setPast] = useState<ERoom[][]>([]);
  const [future, setFuture] = useState<ERoom[][]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [snap, setSnap] = useState(true);
  const [draft, setDraft] = useState<number[][]>([]);
  const [rectStart, setRectStart] = useState<number[] | null>(null);
  const [hover, setHover] = useState<number[] | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = rooms.find((r) => r.key === sel) ?? null;
  const order = useMemo(() => Object.fromEntries(rooms.map((r, i) => [r.key, i + 1])), [rooms]);

  /** Record the current rooms for undo, then apply a change. */
  const commit = (next: ERoom[] | ((cur: ERoom[]) => ERoom[])) => {
    setPast((p) => [...p.slice(-60), clone(rooms)]);
    setFuture([]);
    setRooms((cur) => (typeof next === "function" ? next(cur) : next));
    setDirty(true);
  };
  const patch = (key: string, p: Partial<ERoom>) => commit((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  // Text fields update in place (no undo entry per keystroke).
  const edit = (key: string, p: Partial<ERoom>) => { setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r))); setDirty(true); };
  const undo = () => { if (!past.length) return; setFuture((f) => [clone(rooms), ...f]); setRooms(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setDirty(true); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, clone(rooms)]); setRooms(future[0]); setFuture((f) => f.slice(1)); setDirty(true); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "Escape") { setDraft([]); setRectStart(null); setMode("select"); }
      if (e.key === "Enter" && mode === "polygon") finishPolygon();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { commit((rs) => rs.filter((r) => r.key !== selected.key)); setSel(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const rawPct = (e: { clientX: number; clientY: number }) => {
    const b = canvas.current!.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * 100, ((e.clientY - b.top) / b.height) * 100];
  };
  /** Snap to other rooms' corners, then their walls, then the 0.5% grid. */
  const snapPt = (p: number[], exclude?: string) => {
    if (snap) {
      const others = rooms.filter((r) => r.key !== exclude);
      let best: number[] | null = null, bestD = SNAP_R;
      for (const r of others) for (const v of r.points) { const d = Math.hypot(v[0] - p[0], v[1] - p[1]); if (d < bestD) { best = v; bestD = d; } }
      if (best) return [...best];
      bestD = SNAP_R;
      for (const r of others) for (let i = 0; i < r.points.length; i++) {
        const q = nearestOnSegment(p, r.points[i], r.points[(i + 1) % r.points.length]);
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bestD) { best = q; bestD = d; }
      }
      if (best) return [r1(best[0]), r1(best[1])];
    }
    return [r1(p[0]), r1(p[1])];
  };

  function addRoom(points: number[][]) {
    const key = newKey();
    const n = rooms.length;
    commit((rs) => [...rs, { key, name: `Room ${n + 1}`, type: "Other", points, color: COLORS[n % COLORS.length], customTasks: [], notes: null }]);
    setSel(key); setMode("select");
  }
  function finishPolygon() { if (draft.length >= 3) addRoom(draft); setDraft([]); }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoom.current?.gesturing()) return;
    const raw = rawPct(e);
    if (mode === "polygon") {
      const p = snapPt(raw);
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 2.5) return finishPolygon();
      setDraft((d) => [...d, p]);
    } else if (mode === "rect") {
      canvas.current!.setPointerCapture(e.pointerId);
      setRectStart(snapPt(raw));
    } else if (selected && inside(raw, selected.points)) {
      canvas.current!.setPointerCapture(e.pointerId);
      drag.current = { kind: "move", key: selected.key, start: raw, orig: selected.points.map((p) => [...p]), moved: false };
    }
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const raw = rawPct(e);
    if (zoom.current?.gesturing()) { drag.current = null; setRectStart(null); return; }
    setHover(snapPt(raw, drag.current?.key));
    const d = drag.current;
    if (!d) return;
    if (d.kind === "vertex") {
      const p = snapPt(raw, d.key);
      setRooms((rs) => rs.map((r) => (r.key === d.key ? { ...r, points: r.points.map((pt, i) => (i === d.idx ? p : pt)) } : r)));
    } else {
      let dx = raw[0] - d.start[0], dy = raw[1] - d.start[1];
      if (!d.moved && Math.hypot(dx, dy) < 0.8) return;
      if (!d.moved) { d.moved = true; setPast((p) => [...p.slice(-60), clone(rooms)]); setFuture([]); }
      // Snap the move so the room's first corner lands on a corner/wall/grid.
      const s = snapPt([d.orig[0][0] + dx, d.orig[0][1] + dy], d.key);
      dx = s[0] - d.orig[0][0]; dy = s[1] - d.orig[0][1];
      const minX = Math.min(...d.orig.map((p) => p[0])), maxX = Math.max(...d.orig.map((p) => p[0]));
      const minY = Math.min(...d.orig.map((p) => p[1])), maxY = Math.max(...d.orig.map((p) => p[1]));
      dx = Math.max(-minX, Math.min(100 - maxX, dx)); dy = Math.max(-minY, Math.min(100 - maxY, dy));
      setRooms((rs) => rs.map((r) => (r.key === d.key ? { ...r, points: d.orig.map((p) => [p[0] + dx, p[1] + dy]) } : r)));
    }
    setDirty(true);
  }
  function onUp() {
    if (mode === "rect" && rectStart && hover) {
      const [x0, y0] = rectStart, [x1, y1] = hover;
      if (Math.abs(x1 - x0) > 2 && Math.abs(y1 - y0) > 2) {
        const [l, r, t, b] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
        addRoom([[l, t], [r, t], [r, b], [l, b]]);
      }
      setRectStart(null);
    }
    drag.current = null;
  }

  function startVertexDrag(e: React.PointerEvent, key: string, idx: number) {
    e.stopPropagation();
    canvas.current!.setPointerCapture(e.pointerId);
    setPast((p) => [...p.slice(-60), clone(rooms)]); setFuture([]);
    drag.current = { kind: "vertex", key, idx };
  }
  function insertVertex(e: React.PointerEvent, key: string, after: number, at: number[]) {
    e.stopPropagation();
    const idx = after + 1;
    commit((rs) => rs.map((r) => (r.key === key ? { ...r, points: [...r.points.slice(0, idx), at, ...r.points.slice(idx)] } : r)));
    canvas.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: "vertex", key, idx };
  }
  function removeVertex(key: string, idx: number) {
    const r = rooms.find((x) => x.key === key);
    if (!r || r.points.length <= 3) return;
    commit((rs) => rs.map((x) => (x.key === key ? { ...x, points: x.points.filter((_, i) => i !== idx) } : x)));
  }

  function duplicate() {
    if (!selected) return;
    const key = newKey();
    commit((rs) => [...rs, { ...clone([selected])[0], id: undefined, key, name: `${selected.name} copy`, points: selected.points.map(([x, y]) => [Math.min(100, x + 3), Math.min(100, y + 3)]) }]);
    setSel(key);
  }
  function move(key: string, dir: -1 | 1) {
    const i = rooms.findIndex((r) => r.key === key), j = i + dir;
    if (j < 0 || j >= rooms.length) return;
    commit((rs) => { const c = [...rs]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  }

  async function onImage(f: File) {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/jpeg", 0.85);
      setImage({ dataUrl }); setPreview(dataUrl);
      setAspect(Math.round((img.width / img.height) * 1000) / 1000);
      setDirty(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        await saveLayout(layout.id, {
          name, aspect, image,
          rooms: rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, points: r.points, color: r.color, customTasks: r.customTasks, notes: r.notes })),
        });
        setImage({ keep: true }); setDirty(false); setSaved("Saved"); setPast([]); setFuture([]);
        router.refresh();
        setTimeout(() => setSaved(null), 2500);
      } catch (e) {
        setError(`Couldn't save: ${(e as Error).message}. Your changes are still here; try again.`);
      }
    });
  }

  const draftPoly = mode === "polygon" && draft.length > 0 ? [...draft, ...(hover ? [hover] : [])] : null;
  const rectPreview = mode === "rect" && rectStart && hover ? [[rectStart[0], rectStart[1]], [hover[0], rectStart[1]], [hover[0], hover[1]], [rectStart[0], hover[1]]] : null;
  const tools: { m: Mode; label: string; icon: LucideIcon; hint: string }[] = [
    { m: "select", label: "Select", icon: MousePointer2, hint: "Tap a room to edit it. Drag inside it to move it, drag a corner to reshape, tap + on a wall to add a corner, double-tap a corner to remove it." },
    { m: "rect", label: "Rectangle", icon: RectangleHorizontal, hint: "Drag on the plan to draw a rectangular room. Corners snap to nearby rooms so walls line up." },
    { m: "polygon", label: "Trace", icon: PenLine, hint: "Tap each corner of the room, then tap the first dot (or Finish) to close it. Esc cancels." },
  ];
  const common = selected ? commonTasks[selected.type] ?? [] : [];
  const roomMinutes = (r: ERoom) => (commonTasks[r.type] ?? []).filter((t) => !t.serviceTypeIds.length).reduce((s, t) => s + (t.minutes ?? 0), 0) + r.customTasks.filter((t) => !t.serviceTypeIds.length).reduce((s, t) => s + (t.minutes ?? 0), 0);
  const totalMinutes = rooms.reduce((s, r) => s + roomMinutes(r), 0);
  const setTask = (i: number, p: Partial<TaskDef>) => selected && edit(selected.key, { customTasks: selected.customTasks.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input className="input w-40 font-semibold" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="Floor plan name" />
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            {tools.map((t) => (
              <button key={t.m} type="button" onClick={() => { setMode(t.m); setDraft([]); }} aria-pressed={mode === t.m}
                className={`flex min-h-11 items-center gap-1.5 px-3 text-sm font-semibold md:min-h-9 ${mode === t.m ? "bg-ink text-paper" : "bg-surface text-slate-700"}`}>
                <t.icon className="h-4 w-4" /><span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={undo} disabled={!past.length} className="btn-secondary px-3" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!future.length} className="btn-secondary px-3" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setSnap((s) => !s)} aria-pressed={snap} className={snap ? "btn-primary px-3" : "btn-secondary px-3"} title="Snap to rooms and grid">
            <Magnet className="h-4 w-4" /><span className="hidden sm:inline">Snap</span>
          </button>
          {mode === "polygon" && draft.length >= 3 && <button type="button" onClick={finishPolygon} className="btn-success">Finish room</button>}
        </div>
        <p className="mb-2 text-xs text-slate-500">{tools.find((t) => t.m === mode)?.hint}</p>
        <ZoomPan ref={zoom}>
          <FloorPlan
            ref={canvas} imageUrl={preview} aspect={aspect} grid={!preview}
            rooms={rooms.map((r) => ({ id: r.key, name: r.name, points: r.points, color: r.color, type: r.type }))}
            order={order} selectedId={sel} onRoomClick={mode === "select" ? (id) => { if (!drag.current) setSel(id); } : undefined}
            fill={(r) => ({ fill: r.color, opacity: r.id === sel ? 0.45 : 0.25 })}
            cursor={mode === "select" ? (selected && hover && inside(hover, selected.points) ? "move" : "default") : "crosshair"}
            onCanvasPointerDown={onDown} onCanvasPointerMove={onMove} onCanvasPointerUp={onUp}
            overlay={<>
              {selected && mode === "select" && selected.points.map((p, i) => {
                const next = selected.points[(i + 1) % selected.points.length];
                const mid = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
                return (
                  <span key={i}>
                    <div onPointerDown={(e) => insertVertex(e, selected.key, i, mid)} title="Add a corner"
                      className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-copy items-center justify-center rounded-full border border-[#111] bg-white/80 text-[#111] md:h-4 md:w-4"
                      style={{ left: `${mid[0]}%`, top: `${mid[1]}%` }}><Plus className="h-3 w-3 md:h-2.5 md:w-2.5" /></div>
                    <div onPointerDown={(e) => startVertexDrag(e, selected.key, i)} onDoubleClick={(e) => { e.stopPropagation(); removeVertex(selected.key, i); }}
                      className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[3px] border-[#111] bg-white shadow md:h-4 md:w-4 md:border-2"
                      style={{ left: `${p[0]}%`, top: `${p[1]}%` }} />
                  </span>
                );
              })}
              {mode === "polygon" && draft.map((p, i) => (
                <div key={i} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${i === 0 ? "h-5 w-5 bg-emerald-500" : "h-3 w-3 bg-[#111]"}`} style={{ left: `${p[0]}%`, top: `${p[1]}%` }} />
              ))}
              {mode !== "select" && hover && <div className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#111]" style={{ left: `${hover[0]}%`, top: `${hover[1]}%` }} />}
            </>}
          >
            {draftPoly && <polyline points={draftPoly.map((p) => p.join(",")).join(" ")} fill="rgba(17,17,17,0.08)" stroke="#111" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
            {rectPreview && <polygon points={rectPreview.map((p) => p.join(",")).join(" ")} fill="rgba(17,17,17,0.08)" stroke="#111" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          </FloorPlan>
        </ZoomPan>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary">{pending ? "Saving…" : "Save"}</button>
          <a href={`/locations/${locationId}`} className="btn-secondary">Done</a>
          <label className="btn-secondary"><ImagePlus className="h-4 w-4" />{preview ? "Replace plan" : "Upload plan"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
          </label>
          {preview && <button type="button" className="btn-secondary" onClick={() => { setImage({ remove: true }); setPreview(null); setDirty(true); }}>Remove image</button>}
          {!preview && (
            <select className="input w-32" value={aspect} onChange={(e) => { setAspect(Number(e.target.value)); setDirty(true); }} aria-label="Canvas shape">
              <option value={1}>Square</option><option value={1.33}>4:3</option><option value={1.5}>3:2</option><option value={1.6}>16:10</option><option value={2}>Wide</option><option value={0.75}>Tall</option>
            </select>
          )}
          {saved && <span className="text-sm font-semibold text-emerald-600">{saved}</span>}
          {dirty && !pending && <span className="text-sm text-amber-600">Unsaved changes</span>}
          <button type="button" onClick={() => { if (confirm("Delete this whole floor plan and its rooms?")) start(() => deleteLayout(layout.id)); }} className="ml-auto text-sm text-red-600 hover:underline">Delete floor plan</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="space-y-3">
        {selected ? (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl font-black">Room {order[selected.key]}</h3>
              <div className="flex gap-1">
                <button type="button" onClick={duplicate} className="btn-secondary px-2.5" aria-label="Duplicate room" title="Duplicate"><Copy className="h-4 w-4" /></button>
                <button type="button" onClick={() => { commit((rs) => rs.filter((r) => r.key !== selected.key)); setSel(null); }} className="btn-secondary px-2.5 text-red-600" aria-label="Delete room" title="Delete"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setSel(null)} className="btn-secondary px-2.5" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div><label className="label">Name</label><input className="input" value={selected.name} onChange={(e) => edit(selected.key, { name: e.target.value })} /></div>
            <div>
              <div className="label">Room type <span className="normal-case tracking-normal">· sets the common tasks</span></div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {roomTypes.map((t) => {
                  const Icon = roomIcon(t);
                  return (
                    <button key={t} type="button" onClick={() => patch(selected.key, { type: t, ...(/^Room \d+$/.test(selected.name) ? { name: t } : {}) })}
                      className={`chip gap-1 border ${selected.type === t ? "border-ink bg-ink text-paper" : "border-slate-300 text-slate-700"}`}>
                      <Icon className="h-3.5 w-3.5" />{t}
                    </button>
                  );
                })}
              </div>
              <input className="input" list="room-types" value={selected.type} onChange={(e) => edit(selected.key, { type: e.target.value })} placeholder="Or type a new one" />
              <datalist id="room-types">{roomTypes.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <div className="label">Colour</div>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => <button key={c} type="button" onClick={() => patch(selected.key, { color: c })} className={`h-8 w-8 rounded-full border-2 ${selected.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} aria-label={`Colour ${c}`} />)}
              </div>
            </div>
            <div>
              <div className="label">Common tasks · {selected.type}</div>
              {common.length ? (
                <ul className="space-y-1 text-sm text-slate-600">
                  {common.map((t) => (
                    <li key={t.label} className="flex justify-between gap-2"><span>{t.label}{t.serviceTypeIds.length > 0 && <span className="ml-1 text-xs text-slate-400">({t.serviceTypeIds.map((id) => services.find((s) => s.id === id)?.name).join(", ")} only)</span>}</span>{t.minutes ? <span className="text-xs text-slate-400">{t.minutes}m</span> : null}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-500">None for this type yet. Add them in Settings, Room tasks.</p>}
            </div>
            <div>
              <div className="label">Tasks only this room needs</div>
              <div className="space-y-2">
                {selected.customTasks.map((t, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex gap-2">
                      <input className="input flex-1" value={t.label} placeholder="e.g. Dust piano, dry cloth only" onChange={(e) => setTask(i, { label: e.target.value })} />
                      <input className="input w-16" type="number" min="0" value={t.minutes ?? ""} placeholder="min" aria-label="Minutes" onChange={(e) => setTask(i, { minutes: e.target.value === "" ? null : Number(e.target.value) })} />
                      <button type="button" className="btn-secondary px-2.5" aria-label="Remove task" onClick={() => patch(selected.key, { customTasks: selected.customTasks.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-slate-500">Only on:</span>
                      {services.map((s) => {
                        const on = t.serviceTypeIds.includes(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => setTask(i, { serviceTypeIds: on ? t.serviceTypeIds.filter((x) => x !== s.id) : [...t.serviceTypeIds, s.id] })}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-ink bg-ink text-paper" : "border-slate-300 text-slate-600"}`}>{s.name}</button>
                        );
                      })}
                      {!t.serviceTypeIds.length && <span className="text-[11px] text-slate-400">every visit</span>}
                    </div>
                  </div>
                ))}
                <button type="button" className="btn-secondary w-full" onClick={() => patch(selected.key, { customTasks: [...selected.customTasks, { label: "", serviceTypeIds: [], minutes: null }] })}><Plus className="h-4 w-4" />Add task</button>
              </div>
            </div>
            <div><label className="label">Notes for staff</label><input className="input" value={selected.notes ?? ""} onChange={(e) => edit(selected.key, { notes: e.target.value || null })} placeholder="e.g. Don't move papers on the desk" /></div>
            <p className="text-xs text-slate-500">Estimated {roomMinutes(selected) || "—"} min per standard visit.</p>
          </div>
        ) : (
          <div className="card text-sm text-slate-600">
            <p className="mb-2 font-semibold text-slate-900">How it works</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Upload a photo or sketch of the floor plan, or draw on the grid.</li>
              <li>Draw each room with <b>Rectangle</b> or <b>Trace</b>. Corners snap to rooms you&apos;ve drawn, so shared walls line up.</li>
              <li>Pick the room type to bring in its common tasks, then add tasks only that room needs.</li>
              <li>Put rooms in cleaning order below. Staff follow that route on the job.</li>
            </ol>
          </div>
        )}
        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
            <span className="eyebrow">Cleaning route · {rooms.length} rooms</span>
            {totalMinutes > 0 && <span className="text-xs text-slate-500">~{totalMinutes} min</span>}
          </div>
          {rooms.map((r, i) => {
            const Icon = roomIcon(r.type);
            return (
              <div key={r.key} className={`flex items-center gap-1 pr-2 ${sel === r.key ? "bg-slate-100" : ""}`}>
                <button type="button" onClick={() => { setSel(r.key); setMode("select"); }} className="flex min-h-11 flex-1 items-center gap-2 px-4 text-left text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: r.color }}>{i + 1}</span>
                  <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-xs text-slate-500">{(commonTasks[r.type]?.length ?? 0) + r.customTasks.length} tasks</span>
                </button>
                <button type="button" onClick={() => move(r.key, -1)} disabled={i === 0} className="flex h-9 w-9 items-center justify-center text-slate-500 disabled:opacity-30" aria-label={`Move ${r.name} earlier`}><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(r.key, 1)} disabled={i === rooms.length - 1} className="flex h-9 w-9 items-center justify-center text-slate-500 disabled:opacity-30" aria-label={`Move ${r.name} later`}><ArrowDown className="h-4 w-4" /></button>
              </div>
            );
          })}
          {rooms.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No rooms yet. Pick Rectangle or Trace to draw one.</div>}
        </div>
      </div>
    </div>
  );
}
