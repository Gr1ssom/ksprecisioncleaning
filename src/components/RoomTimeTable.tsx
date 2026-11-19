import type { RoomTimeReport } from "@/lib/reports";

export function RoomTimeTable({ report }: { report: RoomTimeReport }) {
  const max = Math.max(...report.rooms.map((r) => r.avgMin), 1);
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap gap-6 text-sm">
        <div><div className="text-xs uppercase text-slate-500">Visits timed</div><div className="text-xl font-bold">{report.visits}</div></div>
        <div><div className="text-xs uppercase text-slate-500">Avg per visit</div><div className="text-xl font-bold">{report.visits ? Math.round(report.totalMin / report.visits) : 0} min</div></div>
        <div><div className="text-xs uppercase text-slate-500">Most time</div><div className="text-xl font-bold">{report.rooms[0]?.name ?? "—"}</div></div>
      </div>
      <div className="space-y-2">
        {report.rooms.map((r) => (
          <div key={r.roomId} className="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 text-sm">
            <div className="truncate" title={r.name}>{r.name}</div>
            <div className="h-5 rounded bg-slate-100">
              <div className="h-5 rounded" style={{ width: `${(r.avgMin / max) * 100}%`, background: r.color }} />
            </div>
            <div className="text-right tabular-nums"><b>{r.avgMin}m</b> <span className="text-xs text-slate-500">{Math.round(r.share * 100)}%</span></div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Average minutes per visit, from staff room timers. % = share of all timed minutes.</p>
    </div>
  );
}
