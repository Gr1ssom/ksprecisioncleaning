"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { fenceCheck } from "@/lib/geo";
import { uploadImage } from "@/lib/storage";
import type { Assignment, Location, SupplyDepot } from "@/lib/types";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const geo = (f: FormData) => ({ lat: num(f.get("lat")), lng: num(f.get("lng")), acc: num(f.get("acc")) });
const str = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);

/** Load a job the current user may work on (staff: only their own or an open shift). */
async function canTouch(assignmentId: string) {
  const user = await requireUser();
  const a = must(await admin().from("Assignment").select("*, location:Location(*)").eq("id", assignmentId).single(), "job") as Assignment & { location: Location };
  if (user.role === "STAFF" && a.userId && a.userId !== user.id) throw new Error("This job is assigned to someone else.");
  return { user, a };
}

/** Supply pickup check-in: GPS-verified at the depot + decrements stock (one transaction). */
export async function supplyPickup(form: FormData) {
  const user = await requireUser();
  const depotId = String(form.get("depotId"));
  const depot = must(await admin().from("SupplyDepot").select("*").eq("id", depotId).single(), "pickup location") as SupplyDepot;
  const g = geo(form);
  const fence = fenceCheck(g, depot);
  const items = [...form.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ supplyId: k.slice(4), qty: Math.floor(Number(v)) }));
  must(await admin().rpc("supply_pickup", {
    p_user: user.id, p_depot: depotId, p_lat: g.lat, p_lng: g.lng, p_acc: g.acc,
    p_distance: fence.distanceM, p_within: fence.withinFence, p_note: str(form, "note"), p_items: items,
  }), "pickup");
  revalidatePath("/", "layout");
  redirect(`/checkin?done=pickup&fence=${fence.withinFence ?? "na"}`);
}

export async function siteCheckIn(form: FormData) {
  const { user, a } = await canTouch(String(form.get("assignmentId")));
  const g = geo(form);
  const fence = fenceCheck(g, a.location);
  must(await admin().rpc("site_check_in", {
    p_assignment: a.id, p_user: user.id, p_lat: g.lat, p_lng: g.lng, p_acc: g.acc,
    p_distance: fence.distanceM, p_within: fence.withinFence, p_note: str(form, "note"),
  }), "check-in");
  revalidatePath("/", "layout");
  redirect(`/jobs/${a.id}`);
}

export async function siteCheckOut(form: FormData) {
  const { user, a } = await canTouch(String(form.get("assignmentId")));
  const g = geo(form);
  const fence = fenceCheck(g, a.location);
  must(await admin().rpc("site_check_out", {
    p_assignment: a.id, p_user: user.id, p_lat: g.lat, p_lng: g.lng, p_acc: g.acc,
    p_distance: fence.distanceM, p_within: fence.withinFence, p_note: str(form, "note"),
  }), "check-out");
  revalidatePath("/", "layout");
  redirect(`/jobs/${a.id}?done=1`);
}

export async function toggleTask(assignmentId: string, index: number) {
  const { a } = await canTouch(assignmentId);
  const tasks = a.tasks ?? [];
  if (tasks[index]) tasks[index].done = !tasks[index].done;
  must(await admin().from("Assignment").update({ tasks }).eq("id", a.id), "save checklist");
  revalidatePath(`/jobs/${a.id}`);
}

/** Start the timer for a room. Only one room runs at a time per person per job. */
export async function startRoom(assignmentId: string, roomId: string) {
  const { user, a } = await canTouch(assignmentId);
  must(await admin().rpc("start_room", { p_assignment: a.id, p_user: user.id, p_room: roomId }), "start room");
  revalidatePath(`/jobs/${a.id}`);
}

export async function stopRoom(assignmentId: string) {
  const { user, a } = await canTouch(assignmentId);
  must(await admin().rpc("start_room", { p_assignment: a.id, p_user: user.id, p_room: null }), "stop room");
  revalidatePath(`/jobs/${a.id}`);
}

export async function toggleRoomTask(assignmentId: string, roomId: string, label: string) {
  const { user, a } = await canTouch(assignmentId);
  const sb = admin();
  const existing = must(await sb.from("RoomTaskCheck").select("id").match({ assignmentId: a.id, roomId, label }).maybeSingle(), "task");
  if (existing) must(await sb.from("RoomTaskCheck").delete().eq("id", (existing as { id: string }).id), "untick");
  else must(await sb.from("RoomTaskCheck").insert({ assignmentId: a.id, roomId, label, userId: user.id }), "tick");
  revalidatePath(`/jobs/${a.id}`);
}

/** Tick every remaining task in a room at once. */
export async function finishRoom(assignmentId: string, roomId: string, labels: string[]) {
  const { user, a } = await canTouch(assignmentId);
  const rows = labels.map((label) => ({ assignmentId: a.id, roomId, label, userId: user.id }));
  if (rows.length) must(await admin().from("RoomTaskCheck").upsert(rows, { onConflict: "assignmentId,roomId,label", ignoreDuplicates: true }), "finish room");
  revalidatePath(`/jobs/${a.id}`);
}

/** Before/after photo for a room on a job (stored in Supabase Storage). */
export async function addRoomPhoto(form: FormData) {
  const { user, a } = await canTouch(String(form.get("assignmentId")));
  const roomId = String(form.get("roomId"));
  const kind = form.get("kind") === "before" ? "before" : "after";
  const file = form.get("photo");
  if (!(file instanceof File) || !file.size) return;
  const path = await uploadImage(file, `jobs/${a.id}/${roomId}`);
  must(await admin().from("RoomPhoto").insert({ assignmentId: a.id, roomId, userId: user.id, kind, path }), "save photo");
  revalidatePath(`/jobs/${a.id}`);
}

export async function reportIssue(form: FormData) {
  const user = await requireUser();
  const photo = form.get("photo");
  const photoPath = photo instanceof File && photo.size > 0 ? await uploadImage(photo, "issues") : null;
  must(await admin().from("Issue").insert({
    title: String(form.get("title")), detail: str(form, "detail"), locationId: str(form, "locationId"), reportedById: user.id, photoPath,
  }), "report issue");
  revalidatePath("/", "layout");
  redirect(str(form, "back") ?? "/issues");
}

export async function ackSop(sopId: string) {
  const user = await requireUser();
  const sop = must(await admin().from("Sop").select("version").eq("id", sopId).single(), "SOP") as { version: number };
  must(await admin().from("SopAck").upsert({ sopId, userId: user.id, version: sop.version }, { onConflict: "sopId,userId,version", ignoreDuplicates: true }), "mark read");
  revalidatePath("/sops");
}
