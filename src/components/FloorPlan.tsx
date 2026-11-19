"use client";
import { forwardRef } from "react";

export type PlanRoom = { id: string; name: string; points: number[][]; color: string };

export function centroid(points: number[][]) {
  if (!points.length) return [50, 50];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-6) return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * Renders a floor plan: optional uploaded image + traced room polygons (coords in % of canvas).
 * Labels are HTML so they don't stretch with the non-uniform SVG scale.
 */
export const FloorPlan = forwardRef<HTMLDivElement, {
  imageData?: string | null; aspect: number; rooms: PlanRoom[];
  selectedId?: string | null; onRoomClick?: (id: string) => void;
  fill?: (r: PlanRoom) => { fill: string; opacity?: number; pulse?: boolean; badge?: string };
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  children?: React.ReactNode; // extra SVG (editor handles)
  overlay?: React.ReactNode;
  cursor?: string;
}>(function FloorPlan(p, ref) {
  return (
    <div
      ref={ref}
      className="relative w-full select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 touch-none"
      style={{ aspectRatio: String(p.aspect), cursor: p.cursor,
        backgroundImage: p.imageData ? undefined : "linear-gradient(var(--color-slate-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-slate-200) 1px, transparent 1px)",
        backgroundSize: p.imageData ? undefined : "5% 8%" }}
      onPointerDown={p.onCanvasPointerDown} onPointerMove={p.onCanvasPointerMove} onPointerUp={p.onCanvasPointerUp}
    >
      {p.imageData && <img src={p.imageData} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {p.rooms.map((r) => {
          const f = p.fill?.(r) ?? { fill: r.color, opacity: 0.35 };
          const sel = p.selectedId === r.id;
          return (
            <polygon key={r.id} points={r.points.map((pt) => pt.join(",")).join(" ")}
              fill={f.fill} fillOpacity={f.opacity ?? 0.35} stroke={sel ? "#0f172a" : r.color} strokeWidth={sel ? 3 : 1.5}
              vectorEffect="non-scaling-stroke" className={`${p.onRoomClick ? "cursor-pointer" : ""} ${f.pulse ? "animate-pulse" : ""}`}
              onClick={(e) => { if (p.onRoomClick) { e.stopPropagation(); p.onRoomClick(r.id); } }} />
          );
        })}
        {p.children}
      </svg>
      {p.rooms.map((r) => {
        const [x, y] = centroid(r.points);
        const f = p.fill?.(r);
        return (
          <div key={r.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="whitespace-nowrap rounded bg-white/85 px-1.5 py-0.5 text-[11px] font-semibold text-slate-900 shadow-sm sm:text-xs" style={{ color: "#0f172a" }}>{r.name}</div>
            {f?.badge && <div className="mt-0.5 whitespace-nowrap text-[10px] font-bold" style={{ color: "#0f172a", textShadow: "0 0 3px #fff" }}>{f.badge}</div>}
          </div>
        );
      })}
      {p.overlay}
    </div>
  );
});
