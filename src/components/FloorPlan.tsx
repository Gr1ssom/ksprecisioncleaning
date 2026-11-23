"use client";
import { forwardRef } from "react";
import { roomIcon } from "./roomIcons";

export type PlanRoom = { id: string; name: string; points: number[][]; color: string; type?: string };
export type RoomFill = { fill: string; opacity?: number; pulse?: boolean; badge?: string; done?: boolean };

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

/** Point-in-polygon (coords in %). */
export function inside(p: number[], poly: number[][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Renders a floor plan: optional uploaded image + traced room polygons (coords in % of canvas).
 * Labels are HTML so they don't stretch with the non-uniform SVG scale.
 * `order` numbers rooms along the cleaning route.
 */
export const FloorPlan = forwardRef<HTMLDivElement, {
  imageUrl?: string | null; aspect: number; rooms: PlanRoom[];
  selectedId?: string | null; onRoomClick?: (id: string) => void;
  fill?: (r: PlanRoom) => RoomFill;
  order?: Record<string, number>;
  onCanvasPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: React.ReactNode; // extra SVG (editor guides)
  overlay?: React.ReactNode; // extra HTML (editor handles)
  cursor?: string;
  grid?: boolean;
}>(function FloorPlan(p, ref) {
  return (
    <div
      ref={ref}
      className="relative w-full select-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100 touch-none"
      style={{
        aspectRatio: String(p.aspect), cursor: p.cursor,
        backgroundImage: p.imageUrl && !p.grid ? undefined : "linear-gradient(var(--color-slate-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-slate-200) 1px, transparent 1px)",
        backgroundSize: "5% 5%",
      }}
      onPointerDown={p.onCanvasPointerDown} onPointerMove={p.onCanvasPointerMove} onPointerUp={p.onCanvasPointerUp} onDoubleClick={p.onCanvasDoubleClick}
    >
      {p.imageUrl && <img src={p.imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {p.rooms.map((r) => {
          const f = p.fill?.(r) ?? { fill: r.color, opacity: 0.3 };
          const sel = p.selectedId === r.id;
          return (
            <polygon key={r.id} points={r.points.map((pt) => pt.join(",")).join(" ")}
              fill={f.fill} fillOpacity={f.opacity ?? 0.3} stroke={sel ? "#111" : r.color} strokeWidth={sel ? 3 : 1.5}
              strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={`${p.onRoomClick ? "cursor-pointer" : ""} ${f.pulse ? "animate-pulse" : ""}`}
              onClick={(e) => { if (p.onRoomClick) { e.stopPropagation(); p.onRoomClick(r.id); } }} />
          );
        })}
        {p.children}
      </svg>
      {p.rooms.map((r) => {
        const [x, y] = centroid(r.points);
        const f = p.fill?.(r);
        const Icon = r.type ? roomIcon(r.type) : null;
        const n = p.order?.[r.id];
        return (
          <div key={r.id} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${x}%`, top: `${y}%`, color: "#111" }}>
            <div className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-white/90 py-0.5 pl-1 pr-2 text-[10px] font-semibold shadow-sm sm:text-xs">
              {n != null ? <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#111] text-[9px] text-white">{n}</span> : Icon ? <Icon className="h-3 w-3" /> : null}
              {r.name}
            </div>
            {f?.badge && <div className="mt-0.5 whitespace-nowrap text-[10px] font-bold" style={{ textShadow: "0 0 3px #fff, 0 0 3px #fff" }}>{f.badge}</div>}
          </div>
        );
      })}
      {p.overlay}
    </div>
  );
});
