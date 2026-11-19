"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloorPlan } from "@/components/FloorPlan";
import { deleteLayout, saveLayout } from "@/app/actions/manage";

type ERoom = { id?: string; key: string; name: string; type: string; points: number[][]; color: string; customTasks: string[]; notes: string | null };
type Mode = "select" | "polygon" | "rect";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b", "#a855f7", "#f97316"];
const snap = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 2) / 2;
let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

export function LayoutEditor({ locationId, layout, roomTypes, commonTasks }: {
  locationId: string;
  layout: { id: string; name: string; imageData: string | null; aspect: number; rooms: Omit<ERoom, "key">[] };
  roomTypes: string[]; commonTasks: Record<string, string[]>;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(layout.name);
  const [imageData, setImageData] = useState(layout.imageData);
  const [aspect, setAspect] = useState(layout.aspect);
  const [rooms, setRooms] = useState<ERoom[]>(layout.rooms.map((r) => ({ ...r, key: r.id ?? newKey() })));
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [draft, setDraft] = useState<number[][]>([]);
  const [rectStart, setRectStart] = useState<number[] | null>(null);
  const [hover, setHover] = useState<number[] | null>(null);
  const [drag, setDrag] = useState<{ key: string; idx: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = rooms.find((r) => r.key === sel) ?? null;
  const update = (key: string, patch: Partial<ERoom>) => { setRooms((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDraft([]); setRectStart(null); setMode("select"); }
      if (e.key === "Enter" && mode === "polygon") finishPolygon();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toPct = (e: React.PointerEvent) => {
    const b = canvas.current!.getBoundingClientRect();
    return [snap(((e.clientX - b.left) / b.width) * 100), snap(((e.clientY - b.top) / b.height) * 100)];
  };

  function addRoom(points: number[][]) {
    const key = newKey();
    const n = rooms.length;
    setRooms((rs) => [...rs, { key, name: `Room ${n + 1}`, type: "Other", points, color: COLORS[n % COLORS.length], customTasks: [], notes: null }]);
    setSel(key); setDirty(true); setMode("select");
  }
  function finishPolygon() {
    if (draft.length >= 3) addRoom(draft);
    setDraft([]);
  }

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    const p = toPct(e);
    if (mode === "polygon") {
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 2.5) return finishPolygon();
      setDraft((d) => [...d, p]);
    } else if (mode === "rect") {
      canvas.current!.setPointerCapture(e.pointerId);
      setRectStart(p);
    }
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = toPct(e);
    setHover(p);
    if (drag) {
      setRooms((rs) => rs.map((r) => (r.key === drag.key ? { ...r, points: r.points.map((pt, i) => (i === drag.idx ? p : pt)) } : r)));
      setDirty(true);
    }
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
    setDrag(null);
  }

  async function onImage(f: File) {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setImageData(c.toDataURL("image/jpeg", 0.82));
      setAspect(Math.round((img.width / img.height) * 1000) / 1000);
      setDirty(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function save() {
    start(async () => {
      await saveLayout(layout.id, { name, imageData, aspect, rooms: rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, points: r.points, color: r.color, customTasks: r.customTasks, notes: r.notes })) });
      setDirty(false); setSaved("Saved ✓");
      router.refresh();
      setTimeout(() => setSaved(null), 2500);
    });
  }

  const draftPoly = mode === "polygon" && draft.length > 0 ? [...draft, ...(hover ? [hover] : [])] : null;
  const rectPreview = mode === "rect" && rectStart && hover ? [[rectStart[0], rectStart[1]], [hover[0], rectStart[1]], [hover[0], hover[1]], [rectStart[0], hover[1]]] : null;

  const tools: { m: Mode; label: string; hint: string }[] = [
    { m: "select", label: "👆 Select", hint: "Tap a room to edit it. Drag the white dots to reshape." },
    { m: "rect", label: "▭ Rectangle", hint: "Drag on the plan to draw a rectangular room." },
    { m: "polygon", label: "✏️ Trace", hint: "Tap each corner of the room. Tap the first dot (or press Finish) to close. Esc cancels." },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input className="input w-44" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          {tools.map((t) => (
            <button key={t.m} onClick={() => { setMode(t.m); setDraft([]); }} className={mode === t.m ? "btn-primary" : "btn-secondary"}>{t.label}</button>
          ))}
          {mode === "polygon" && draft.length >= 3 && <button onClick={finishPolygon} className="btn-success">Finish room</button>}
          <label className="btn-secondary">🖼️ {imageData ? "Replace plan" : "Upload plan"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
          </label>
          {imageData && <button className="btn-secondary" onClick={() => { setImageData(null); setDirty(true); }}>Remove image</button>}
          {!imageData && (
            <select className="input w-36" value={aspect} onChange={(e) => { setAspect(Number(e.target.value)); setDirty(true); }} title="Canvas shape">
              <option value={1}>Square</option><option value={1.33}>4:3</option><option value={1.5}>3:2</option><option value={1.6}>16:10</option><option value={2}>Wide</option><option value={0.75}>Tall</option>
            </select>
          )}
        </div>
        <p className="mb-2 text-xs text-slate-500">{tools.find((t) => t.m === mode)?.hint}</p>
        <FloorPlan
          ref={canvas} imageData={imageData} aspect={aspect}
          rooms={rooms.map((r) => ({ id: r.key, name: r.name, points: r.points, color: r.color }))}
          selectedId={sel} onRoomClick={mode === "select" ? setSel : undefined}
          fill={(r) => ({ fill: r.color, opacity: r.id === sel ? 0.5 : 0.3 })}
          cursor={mode === "select" ? "default" : "crosshair"}
          onCanvasPointerDown={onDown} onCanvasPointerMove={onMove} onCanvasPointerUp={onUp}
          overlay={<>
            {selected && mode === "select" && selected.points.map((p, i) => (
              <div key={i} onPointerDown={(e) => { e.stopPropagation(); canvas.current!.setPointerCapture(e.pointerId); setDrag({ key: selected.key, idx: i }); }}
                className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-[#0f172a] bg-white shadow"
                style={{ left: `${p[0]}%`, top: `${p[1]}%` }} />
            ))}
            {mode === "polygon" && draft.map((p, i) => (
              <div key={i} className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${i === 0 ? "h-4 w-4 bg-emerald-500" : "h-3 w-3 bg-brand-600"}`} style={{ left: `${p[0]}%`, top: `${p[1]}%` }} />
            ))}
          </>}
        >
          {draftPoly && <polyline points={draftPoly.map((p) => p.join(",")).join(" ")} fill="rgba(29,143,225,0.15)" stroke="#0b72c2" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          {rectPreview && <polygon points={rectPreview.map((p) => p.join(",")).join(" ")} fill="rgba(29,143,225,0.2)" stroke="#0b72c2" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        </FloorPlan>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={pending || !dirty} className="btn-primary">{pending ? "Saving…" : "Save"}</button>
          <a href={`/locations/${locationId}`} className="btn-secondary">Done</a>
          {saved && <span className="text-sm text-emerald-600">{saved}</span>}
          {dirty && !pending && <span className="text-sm text-amber-600">Unsaved changes</span>}
          <button onClick={() => { if (confirm("Delete this whole floor plan and its rooms?")) start(() => deleteLayout(layout.id)); }} className="ml-auto text-sm text-red-600 hover:underline">Delete floor plan</button>
        </div>
      </div>

      <div className="space-y-3">
        {selected ? (
          <div className="card space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Room</h3><button className="text-xs text-slate-500" onClick={() => setSel(null)}>Close</button></div>
            <div><label className="label">Name</label><input className="input" value={selected.name} onChange={(e) => update(selected.key, { name: e.target.value })} /></div>
            <div>
              <label className="label">Room type (sets the common tasks)</label>
              <input className="input" list="room-types" value={selected.type} onChange={(e) => update(selected.key, { type: e.target.value })} />
              <datalist id="room-types">{roomTypes.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className="label">Colour</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => <button key={c} onClick={() => update(selected.key, { color: c })} className={`h-7 w-7 rounded-full border-2 ${selected.color === c ? "border-slate-900" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}
              </div>
            </div>
            <div>
              <div className="label">Common tasks ({selected.type})</div>
              {(commonTasks[selected.type] ?? []).length ? (
                <ul className="list-disc pl-5 text-xs text-slate-600">{commonTasks[selected.type].map((t) => <li key={t}>{t}</li>)}</ul>
              ) : <p className="text-xs text-slate-500">None for this type. Add them in Settings › Room tasks.</p>}
            </div>
            <div>
              <label className="label">Custom tasks for this room (one per line)</label>
              <textarea className="input" rows={4} value={selected.customTasks.join("\n")} onChange={(e) => update(selected.key, { customTasks: e.target.value.split("\n") })}
                onBlur={() => update(selected.key, { customTasks: selected.customTasks.map((t) => t.trim()).filter(Boolean) })} />
            </div>
            <div><label className="label">Notes for staff</label><input className="input" value={selected.notes ?? ""} onChange={(e) => update(selected.key, { notes: e.target.value || null })} placeholder="e.g. Don't move papers on desk" /></div>
            <button className="btn-danger w-full" onClick={() => { setRooms((rs) => rs.filter((r) => r.key !== selected.key)); setSel(null); setDirty(true); }}>Delete room</button>
          </div>
        ) : (
          <div className="card text-sm text-slate-500">
            <p className="mb-2 font-semibold text-slate-700">How it works</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Upload a photo or sketch of the floor plan (optional – you can draw on the grid).</li>
              <li>Trace each room with <b>Trace</b> or <b>Rectangle</b>.</li>
              <li>Pick a room type to apply its common tasks, then add tasks only this room needs.</li>
              <li>Save. Staff tap rooms on the job map to see tasks and run room timers.</li>
            </ol>
          </div>
        )}
        <div className="card p-0">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Rooms ({rooms.length})</div>
          {rooms.map((r) => (
            <button key={r.key} onClick={() => { setSel(r.key); setMode("select"); }} className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50 ${sel === r.key ? "bg-brand-50" : ""}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-xs text-slate-500">{r.type} · {(commonTasks[r.type]?.length ?? 0) + r.customTasks.filter(Boolean).length} tasks</span>
            </button>
          ))}
          {rooms.length === 0 && <div className="px-4 py-3 text-sm text-slate-500">No rooms yet.</div>}
        </div>
      </div>
    </div>
  );
}
