"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * Add one or more locations while saving a client. Each row needs only an address (rows left blank are skipped); the name
 * defaults to the client's name and the map position is looked up from the address on save.
 */
export function NewLocations({ start = 0 }: { start?: number }) {
  const [rows, setRows] = useState<number[]>(() => Array.from({ length: start }, (_, i) => i));
  const [next, setNext] = useState(start);
  return (
    <div className="space-y-2">
      {rows.map((k, i) => (
        <div key={k} className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">New location{rows.length > 1 ? ` ${i + 1}` : ""}</span>
            <button type="button" onClick={() => setRows(rows.filter((r) => r !== k))} className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-900" aria-label="Remove this location"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="loc_address" placeholder="Street address, city, state, ZIP" className="input sm:col-span-2" autoComplete="off" />
            <input name="loc_name" placeholder="Name (blank = client name)" className="input" />
            <input name="loc_notes" placeholder="Access notes (key box, alarm, parking)" className="input" />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => { setRows([...rows, next]); setNext(next + 1); }} className="btn-secondary"><Plus className="h-4 w-4" />{rows.length ? "Add another location" : "Add location"}</button>
      {rows.length > 0 && <p className="text-xs text-slate-500">The map position for check-ins is looked up from the address when you save. You can adjust it, and add a floor plan, on the location&apos;s page.</p>}
    </div>
  );
}
