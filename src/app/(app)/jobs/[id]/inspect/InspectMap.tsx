"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { FloorPlan, type PlanRoom } from "@/components/FloorPlan";
import { PhotoInput } from "@/components/PhotoInput";
import { ZoomPan } from "@/components/ZoomPan";
import { scoreRoom } from "@/app/actions/quality";
import { RESULT_LABEL, RESULTS, type RoomResult } from "@/lib/quality";

type Score = { result: RoomResult; note: string | null; photoUrl: string | null };
type Plan = { id: string; name: string; imageUrl: string | null; aspect: number; rooms: PlanRoom[] };

// Floor-plan colours for the three results (same meaning everywhere: green ok, amber fix, red fail).
const FILL: Record<RoomResult, string> = { PASS: "#16a34a", TOUCH_UP: "#f59e0b", FAIL: "#dc2626" };
const CHIP: Record<RoomResult, string> = {
  PASS: "has-[:checked]:bg-emerald-600 has-[:checked]:border-emerald-600",
  TOUCH_UP: "has-[:checked]:bg-amber-500 has-[:checked]:border-amber-500",
  FAIL: "has-[:checked]:bg-red-600 has-[:checked]:border-red-600",
};

/** Walk the job on the floor plan: tap a room, score it, add a note or photo, move on. */
export function InspectMap({ assignmentId, layouts, scores }: { assignmentId: string; layouts: Plan[]; scores: Record<string, Score> }) {
  const route = layouts.flatMap((l) => l.rooms.map((r) => ({ ...r, layoutId: l.id })));
  const order = Object.fromEntries(route.map((r, i) => [r.id, i + 1]));
  const firstOpen = route.find((r) => !scores[r.id]) ?? route[0];
  const [selected, setSelected] = useState<string | null>(firstOpen?.id ?? null);
  const room = route.find((r) => r.id === selected) ?? null;
  const [layoutId, setLayoutId] = useState(room?.layoutId ?? layouts[0]?.id);
  const layout = layouts.find((l) => l.id === layoutId) ?? layouts[0];
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const pick = (id: string) => {
    setSelected(id);
    const r = route.find((x) => x.id === id);
    if (r) setLayoutId(r.layoutId);
    setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  };
  const next = route.find((r) => r.id !== selected && !scores[r.id]);
  const s = room ? scores[room.id] : undefined;

  const save = (fd: FormData) => start(async () => {
    setErr(null);
    const r = await scoreRoom(fd);
    if (r.error) { setErr(r.error); return; }
    router.refresh();
    if (next) pick(next.id);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        {layouts.length > 1 && (
          <div className="mb-2 flex gap-1">
            {layouts.map((l) => <button key={l.id} type="button" onClick={() => setLayoutId(l.id)} className={`chip ${l.id === layout.id ? "bg-ink text-paper" : "border border-slate-300 bg-surface text-slate-600"}`}>{l.name}</button>)}
          </div>
        )}
        <ZoomPan panOneFinger>
          <FloorPlan imageUrl={layout.imageUrl} aspect={layout.aspect} rooms={layout.rooms} selectedId={selected} order={order} onRoomClick={pick}
            fill={(r) => {
              const sc = scores[r.id];
              return sc ? { fill: FILL[sc.result], opacity: 0.45, badge: RESULT_LABEL[sc.result] } : { fill: r.color, opacity: 0.15 };
            }} />
        </ZoomPan>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" /> pass</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> touch-up</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-600" /> fail</span>
          <span>{Object.keys(scores).length}/{route.length} scored</span>
        </div>
      </div>

      <div ref={panel} className="card h-fit scroll-mt-20 lg:sticky lg:top-4">
        {!room ? <div className="py-6 text-center text-sm text-slate-500">Tap a room to score it.</div> : (
          <form key={room.id} action={save} className="space-y-3">
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="roomId" value={room.id} />
            <div className="font-serif text-xl font-black leading-tight">{order[room.id]}. {room.name}</div>
            {err && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{err}</div>}
            <fieldset className="grid grid-cols-3 gap-2">
              <legend className="label">Result</legend>
              {RESULTS.map((k) => (
                <label key={k} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-sm font-semibold has-[:checked]:text-white ${CHIP[k]}`}>
                  <input type="radio" name="result" value={k} defaultChecked={s?.result === k} required className="sr-only" />{RESULT_LABEL[k]}
                </label>
              ))}
            </fieldset>
            <textarea name="note" rows={2} defaultValue={s?.note ?? ""} className="input" placeholder="What needs fixing? (optional)" />
            {s?.photoUrl && <a href={s.photoUrl} target="_blank" rel="noreferrer"><img src={s.photoUrl} alt={`${room.name} inspection photo`} className="h-20 w-20 rounded-md object-cover" /></a>}
            <PhotoInput label={s?.photoUrl ? "Replace photo" : "Add photo"} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : next ? "Save and next" : "Save"}</button>
              {next && <button type="button" onClick={() => pick(next.id)} className="btn-secondary">Skip<ChevronRight className="h-4 w-4" /></button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
