"use client";
import { useState } from "react";
import { FloorPlan } from "@/components/FloorPlan";
import type { MapLayout } from "../../jobs/[id]/RoomMap";

/** Read-only floor plan: tap a room to see its checklist. */
export function PlanPreview({ layout }: { layout: MapLayout }) {
  const [sel, setSel] = useState<string | null>(null);
  const room = layout.rooms.find((r) => r.id === sel);
  return (
    <>
      <FloorPlan imageData={layout.imageData} aspect={layout.aspect} rooms={layout.rooms} selectedId={sel} onRoomClick={(id) => setSel(id === sel ? null : id)} />
      {room && (
        <div className="mt-2 rounded-lg border border-slate-200 p-3 text-sm">
          <div className="font-semibold">{room.name} <span className="font-normal text-slate-500">· {room.type}</span></div>
          {room.notes && <p className="text-xs text-slate-500">{room.notes}</p>}
          <ul className="mt-1 list-disc pl-5">{room.tasks.map((t) => <li key={t.label}>{t.label}{t.custom && <span className="ml-1 text-xs text-purple-600">(this room)</span>}</li>)}</ul>
        </div>
      )}
    </>
  );
}
