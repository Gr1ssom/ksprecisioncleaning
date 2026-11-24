import "server-only";
import { admin, must } from "./supabase/server";
import { fenceCheck } from "./geo";
import { notifyLowStock } from "./notify";
import { afterCheckOut } from "./clientReports";
import type { Profile } from "./types";
import type { Assignment, Location, SupplyDepot } from "./types";

/**
 * Field actions shared by the server actions (online) and /api/field (replaying actions a phone
 * saved while it had no signal). Each takes the time the action happened on the phone.
 */
export type Geo = { lat: number | null; lng: number | null; acc: number | null };
export type FieldOp =
  | { op: "checkIn"; assignmentId: string; geo: Geo; note?: string | null }
  | { op: "checkOut"; assignmentId: string; geo: Geo; note?: string | null }
  | { op: "startRoom"; assignmentId: string; roomId: string }
  | { op: "stopRoom"; assignmentId: string }
  | { op: "setRoomTask"; assignmentId: string; roomId: string; label: string; done: boolean }
  | { op: "finishRoom"; assignmentId: string; roomId: string; labels: string[] }
  | { op: "setTask"; assignmentId: string; index: number; done: boolean }
  | { op: "clock"; on: boolean; geo: Geo }
  | { op: "break"; on: boolean };

/** Load a job the person may work on (staff: only their own). */
export async function jobFor(user: Profile, assignmentId: string) {
  const a = must(await admin().from("Assignment").select("*, location:Location(*)").eq("id", assignmentId).single(), "job") as Assignment & { location: Location };
  if (user.role === "STAFF" && a.userId !== user.id) throw new FieldError("This job isn't assigned to you. Ask your manager.");
  return a;
}

/** An error worth showing the person as is (not a crash). */
export class FieldError extends Error {}

/** Clamp a phone's time: never in the future, never more than 7 days back. */
export function clampAt(at: string | number | undefined, now = Date.now()) {
  const t = at == null ? now : typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return new Date(now).toISOString();
  return new Date(Math.min(now, Math.max(now - 7 * 86400_000, t))).toISOString();
}

const rpcError = (e: unknown) => {
  const m = (e as Error).message ?? "";
  const known = m.match(/(Check out of your job before ending your day\.|Start your day before taking a break\.)/);
  if (known) throw new FieldError(known[1]);
  throw e;
};

export async function runFieldOp(user: Profile, f: FieldOp, atIso: string) {
  const sb = admin();
  switch (f.op) {
    case "checkIn":
    case "checkOut": {
      const a = await jobFor(user, f.assignmentId);
      if (f.op === "checkIn" && a.status === "CANCELLED") throw new FieldError("This job was cancelled.");
      const fence = fenceCheck(f.geo, a.location);
      must(await sb.rpc(f.op === "checkIn" ? "site_check_in" : "site_check_out", {
        p_assignment: a.id, p_user: user.id, p_lat: f.geo.lat, p_lng: f.geo.lng, p_acc: f.geo.acc,
        p_distance: fence.distanceM, p_within: fence.withinFence, p_note: f.note ?? null, p_at: atIso,
      }), f.op === "checkIn" ? "check-in" : "check-out");
      // Client visit report (if the client gets them). Never fails the check-out.
      if (f.op === "checkOut") await afterCheckOut(a.id);
      return { assignmentId: a.id, withinFence: fence.withinFence };
    }
    case "startRoom":
    case "stopRoom": {
      const a = await jobFor(user, f.assignmentId);
      must(await sb.rpc("start_room", { p_assignment: a.id, p_user: user.id, p_room: f.op === "startRoom" ? f.roomId : null, p_at: atIso }), "room timer");
      return {};
    }
    case "setRoomTask": {
      const a = await jobFor(user, f.assignmentId);
      if (f.done) must(await sb.from("RoomTaskCheck").upsert({ assignmentId: a.id, roomId: f.roomId, label: f.label, userId: user.id, doneAt: atIso }, { onConflict: "assignmentId,roomId,label", ignoreDuplicates: true }), "tick");
      else must(await sb.from("RoomTaskCheck").delete().match({ assignmentId: a.id, roomId: f.roomId, label: f.label }), "untick");
      return {};
    }
    case "finishRoom": {
      const a = await jobFor(user, f.assignmentId);
      const rows = f.labels.map((label) => ({ assignmentId: a.id, roomId: f.roomId, label, userId: user.id, doneAt: atIso }));
      if (rows.length) must(await sb.from("RoomTaskCheck").upsert(rows, { onConflict: "assignmentId,roomId,label", ignoreDuplicates: true }), "finish room");
      return {};
    }
    case "setTask": {
      const a = await jobFor(user, f.assignmentId);
      const tasks = a.tasks ?? [];
      if (tasks[f.index]) tasks[f.index].done = f.done;
      must(await sb.from("Assignment").update({ tasks }).eq("id", a.id), "save checklist");
      return {};
    }
    case "clock":
      await sb.rpc("shift_clock", { p_user: user.id, p_in: f.on, p_at: atIso, p_lat: f.geo.lat, p_lng: f.geo.lng }).then((r) => { if (r.error) rpcError(r.error); });
      return {};
    case "break":
      await sb.rpc("shift_break", { p_user: user.id, p_start: f.on, p_at: atIso }).then((r) => { if (r.error) rpcError(r.error); });
      return {};
  }
}

/** Supply pickup (online only: it needs current stock). Returns whether it was inside the fence. */
export async function pickup(user: Profile, depotId: string, geo: Geo, note: string | null, items: { supplyId: string; qty: number }[]) {
  const depot = must(await admin().from("SupplyDepot").select("*").eq("id", depotId).single(), "pickup location") as SupplyDepot;
  const fence = fenceCheck(geo, depot);
  must(await admin().rpc("supply_pickup", {
    p_user: user.id, p_depot: depotId, p_lat: geo.lat, p_lng: geo.lng, p_acc: geo.acc,
    p_distance: fence.distanceM, p_within: fence.withinFence, p_note: note, p_items: items,
  }), "pickup");
  await notifyLowStock(depotId, items.map((i) => i.supplyId));
  return fence;
}
