"use client";
import { useState } from "react";
import { FloorPlan } from "@/components/FloorPlan";
import { ZoomPan } from "@/components/ZoomPan";
import type { PlanLayout } from "@/lib/rooms";

/** Read-only floor plan: tap a room to see its checklist. Rooms are numbered in cleaning order. */
export function PlanPreview({ layout }: { layout: PlanLayout }) {
  const [sel, setSel] = useState<string | null>(null);
  const room = layout.rooms.find((r) => r.id === sel);
  const order = Object.fromEntries(layout.rooms.map((r, i) => [r.id, i + 1]));
  return (
    <>
      <ZoomPan panOneFinger>
        <FloorPlan imageUrl={layout.imageUrl} aspect={layout.aspect} rooms={layout.rooms} order={order} selectedId={sel} onRoomClick={(id) => setSel(id === sel ? null : id)} />
      </ZoomPan>
      {room ? (
        <div className="mt-2 rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold">{order[room.id]}. {room.name} <span className="font-normal text-slate-500">· {room.type}</span></div>
            {room.estMinutes > 0 && <span className="text-xs text-slate-500">~{room.estMinutes} min</span>}
          </div>
          {room.notes && <p className="text-xs text-slate-500">{room.notes}</p>}
          <ul className="mt-1 list-disc pl-5">
            {room.tasks.map((t) => <li key={t.label}>{t.label}{t.custom && <span className="ml-1 text-xs text-purple-700">(this room)</span>}</li>)}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">Tap a room to see its tasks.</p>
      )}
    </>
  );
}
