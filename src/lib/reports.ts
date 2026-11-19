import "server-only";
import { db } from "./db";

export type RoomTimeReport = {
  visits: number;
  totalMin: number;
  rooms: { roomId: string; name: string; type: string; color: string; totalMin: number; avgMin: number; visits: number; share: number }[];
};

/** Time spent per room at a location over the last N days (or a date range), from room timers. */
export async function roomTimeReport(locationId: string, days = 90, range?: { from: Date; to: Date }): Promise<RoomTimeReport> {
  const from = range?.from ?? new Date(Date.now() - days * 86400_000);
  const to = range?.to ?? new Date();
  const sessions = await db.roomSession.findMany({
    where: { endedAt: { not: null }, startedAt: { gte: from, lte: to }, assignment: { locationId } },
    include: { room: true },
  });
  const byRoom = new Map<string, { name: string; type: string; color: string; ms: number; visits: Set<string> }>();
  const visits = new Set<string>();
  for (const s of sessions) {
    visits.add(s.assignmentId);
    const e = byRoom.get(s.roomId) ?? { name: s.room.name, type: s.room.type, color: s.room.color, ms: 0, visits: new Set() };
    e.ms += s.endedAt!.getTime() - s.startedAt.getTime();
    e.visits.add(s.assignmentId);
    byRoom.set(s.roomId, e);
  }
  const totalMs = [...byRoom.values()].reduce((s, r) => s + r.ms, 0);
  return {
    visits: visits.size,
    totalMin: Math.round(totalMs / 60000),
    rooms: [...byRoom.entries()]
      .map(([roomId, r]) => ({ roomId, name: r.name, type: r.type, color: r.color, totalMin: Math.round(r.ms / 60000), avgMin: Math.round(r.ms / 60000 / r.visits.size), visits: r.visits.size, share: totalMs ? r.ms / totalMs : 0 }))
      .sort((a, b) => b.avgMin - a.avgMin),
  };
}
