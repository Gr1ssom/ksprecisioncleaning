import "server-only";
import { admin, must } from "./supabase/server";

export type RoomTimeReport = {
  visits: number;
  totalMin: number;
  rooms: { roomId: string; name: string; type: string; color: string; totalMin: number; avgMin: number; visits: number; share: number }[];
};

type Row = { assignmentId: string; roomId: string; startedAt: string; endedAt: string; room: { name: string; type: string; color: string }; assignment: { locationId: string } };

/** Time spent per room at a location over the last N days, from closed room timers. */
export async function roomTimeReport(locationId: string, days = 90): Promise<RoomTimeReport> {
  const from = new Date(Date.now() - days * 86400_000).toISOString();
  const sessions = must(
    await admin().from("RoomSession")
      .select("assignmentId, roomId, startedAt, endedAt, room:Room!inner(name, type, color), assignment:Assignment!inner(locationId)")
      .eq("assignment.locationId", locationId).not("endedAt", "is", null).gte("startedAt", from),
    "room sessions",
  ) as unknown as Row[];
  const byRoom = new Map<string, { name: string; type: string; color: string; ms: number; visits: Set<string> }>();
  const visits = new Set<string>();
  for (const s of sessions) {
    visits.add(s.assignmentId);
    const e = byRoom.get(s.roomId) ?? { name: s.room.name, type: s.room.type, color: s.room.color, ms: 0, visits: new Set<string>() };
    e.ms += new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
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

/** Average minutes per visit for each room (for "usual time" on the job map). */
export async function usualRoomMinutes(roomIds: string[]): Promise<Record<string, number>> {
  if (!roomIds.length) return {};
  const rows = must(await admin().from("RoomSession").select("roomId, assignmentId, startedAt, endedAt").in("roomId", roomIds).not("endedAt", "is", null), "room history") as { roomId: string; assignmentId: string; startedAt: string; endedAt: string }[];
  const acc = new Map<string, { ms: number; visits: Set<string> }>();
  for (const r of rows) {
    const e = acc.get(r.roomId) ?? { ms: 0, visits: new Set<string>() };
    e.ms += new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime();
    e.visits.add(r.assignmentId);
    acc.set(r.roomId, e);
  }
  return Object.fromEntries([...acc.entries()].map(([id, e]) => [id, Math.round(e.ms / 60000 / e.visits.size)]));
}
