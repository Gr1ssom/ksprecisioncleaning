"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";

export type ZoomPanHandle = { gesturing: () => boolean; reset: () => void };

/**
 * Pinch-to-zoom / two-finger pan container (and ctrl+wheel, +/− buttons on desktop).
 * One finger is left alone so taps, drawing and dragging inside still work.
 * With `panOneFinger`, a one-finger drag pans while zoomed in (for read-only maps).
 */
export const ZoomPan = forwardRef<ZoomPanHandle, { children: React.ReactNode; panOneFinger?: boolean; className?: string }>(function ZoomPan(
  { children, panOneFinger, className = "" }, ref,
) {
  const outer = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mx: number; my: number; s: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const clamp = (n: { s: number; x: number; y: number }) => {
    const r = outer.current?.getBoundingClientRect();
    const s = Math.min(5, Math.max(1, n.s));
    if (!r) return { s, x: n.x, y: n.y };
    return { s, x: Math.min(0, Math.max(r.width - r.width * s, n.x)), y: Math.min(0, Math.max(r.height - r.height * s, n.y)) };
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => setT((cur) => {
    const r = outer.current!.getBoundingClientRect();
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    const s = Math.min(5, Math.max(1, cur.s * factor));
    return clamp({ s, x: px - ((px - cur.x) * s) / cur.s, y: py - ((py - cur.y) * s) / cur.s });
  });
  useImperativeHandle(ref, () => ({ gesturing: () => pts.current.size > 1 || !!drag.current?.moved, reset: () => setT({ s: 1, x: 0, y: 0 }) }));

  const local = (e: React.PointerEvent) => { const r = outer.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={outer}
        className="relative touch-none overflow-hidden rounded-lg"
        onPointerDownCapture={(e) => {
          pts.current.set(e.pointerId, local(e));
          if (pts.current.size === 2) {
            const [a, b] = [...pts.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ...t };
            drag.current = null;
          } else if (pts.current.size === 1 && panOneFinger && t.s > 1) {
            const p = local(e);
            drag.current = { x: p.x, y: p.y, tx: t.x, ty: t.y, moved: false };
          }
        }}
        onPointerMoveCapture={(e) => {
          if (!pts.current.has(e.pointerId)) return;
          pts.current.set(e.pointerId, local(e));
          if (pinch.current && pts.current.size >= 2) {
            e.stopPropagation();
            const [a, b] = [...pts.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const p = pinch.current;
            const s = Math.min(5, Math.max(1, (p.s * d) / Math.max(p.d, 1)));
            setT(clamp({ s, x: mx - ((p.mx - p.x) * s) / p.s, y: my - ((p.my - p.y) * s) / p.s }));
          } else if (drag.current) {
            const p = local(e), dg = drag.current;
            if (!dg.moved && Math.hypot(p.x - dg.x, p.y - dg.y) > 6) dg.moved = true;
            if (dg.moved) { e.stopPropagation(); setT((cur) => clamp({ s: cur.s, x: dg.tx + p.x - dg.x, y: dg.ty + p.y - dg.y })); }
          }
        }}
        onPointerUpCapture={(e) => {
          pts.current.delete(e.pointerId);
          if (pts.current.size < 2) pinch.current = null;
          if (drag.current?.moved) suppressClick.current = true;
          if (!pts.current.size) drag.current = null;
        }}
        onPointerCancelCapture={(e) => { pts.current.delete(e.pointerId); pinch.current = null; drag.current = null; }}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }}
        onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); const p = { x: e.clientX - outer.current!.getBoundingClientRect().left, y: e.clientY - outer.current!.getBoundingClientRect().top }; zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); } }}
      >
        <div style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transformOrigin: "0 0" }}>{children}</div>
      </div>
      <div className="absolute bottom-2 right-2 z-10 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-surface/95 shadow-sm">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.4)} className="flex h-10 w-10 items-center justify-center hover:bg-slate-100"><Plus className="h-4 w-4" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.4)} className="flex h-10 w-10 items-center justify-center border-t border-slate-200 hover:bg-slate-100"><Minus className="h-4 w-4" /></button>
        {t.s > 1 && <button type="button" aria-label="Fit" onClick={() => setT({ s: 1, x: 0, y: 0 })} className="flex h-10 w-10 items-center justify-center border-t border-slate-200 hover:bg-slate-100"><Maximize2 className="h-4 w-4" /></button>}
      </div>
    </div>
  );
});
