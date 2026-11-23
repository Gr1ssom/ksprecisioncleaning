"use client";
import { useState } from "react";
import { FloorPlan, type PlanRoom } from "./FloorPlan";

type L = { id: string; name: string; imageUrl: string | null; aspect: number; rooms: PlanRoom[] };

/** Floor plan shaded by average minutes per visit: the darker the room, the more time it takes. */
export function RoomHeatmap({ layouts, minutes }: { layouts: L[]; minutes: Record<string, number> }) {
  const [i, setI] = useState(0);
  const max = Math.max(1, ...Object.values(minutes));
  const layout = layouts[i];
  if (!layout) return null;
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="eyebrow">Where the time goes · average minutes per visit</div>
        {layouts.length > 1 && (
          <div className="flex gap-1">
            {layouts.map((l, j) => (
              <button key={l.id} onClick={() => setI(j)} className={`chip ${j === i ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>{l.name}</button>
            ))}
          </div>
        )}
      </div>
      <FloorPlan
        imageUrl={layout.imageUrl} aspect={layout.aspect} rooms={layout.rooms}
        fill={(r) => {
          const m = minutes[r.id];
          if (!m) return { fill: "#9ca3af", opacity: 0.12, badge: "—" };
          const t = m / max; // 0..1 → amber → deep red
          const hue = 45 - 45 * t, light = 62 - 22 * t;
          return { fill: `hsl(${hue} 90% ${light}%)`, opacity: 0.35 + 0.45 * t, badge: `${m} min` };
        }}
      />
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span>Less</span>
        <span className="h-2 w-32 rounded-full" style={{ background: "linear-gradient(90deg, hsl(45 90% 62%), hsl(0 90% 40%))" }} />
        <span>More time</span>
      </div>
    </div>
  );
}
