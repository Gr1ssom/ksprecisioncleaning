"use client";
import { useState } from "react";

type Depot = { id: string; name: string; address: string; stock: Record<string, number> };
export function DepotPicker({ depots, supplies }: { depots: Depot[]; supplies: { id: string; name: string; unit: string }[] }) {
  const [depotId, setDepotId] = useState(depots[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const depot = depots.find((d) => d.id === depotId);
  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + d) }));
  return (
    <>
      <div>
        <label className="label">Pickup location</label>
        <select name="depotId" className="input" value={depotId} onChange={(e) => { setDepotId(e.target.value); setQty({}); }} required>
          {depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {depot && <p className="mt-1 text-xs text-slate-500">{depot.address}</p>}
      </div>
      <div>
        <label className="label">What are you taking?</label>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {supplies.map((s) => {
            const have = depot?.stock[s.id] ?? 0;
            const q = qty[s.id] ?? 0;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="truncate">{s.name}</div>
                  <div className={`text-xs ${have <= 0 ? "text-red-600" : "text-slate-500"}`}>{have} {s.unit} on hand</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => bump(s.id, -1)}>−</button>
                  <input name={`qty_${s.id}`} value={q} readOnly className="w-10 text-center text-sm font-semibold bg-transparent" />
                  <button type="button" className="btn-secondary h-8 w-8 p-0" onClick={() => bump(s.id, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
