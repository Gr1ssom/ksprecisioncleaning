"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { removeImages, uploadDataUrl } from "@/lib/storage";
import type { Role } from "@/lib/session";
import type { Assignment, TaskDef } from "@/lib/types";

const s = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v); };
const lines = (v: string | null) => (v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const done = (path: string) => { revalidatePath("/", "layout"); redirect(path); };
const addDays = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * 86400_000).toISOString().slice(0, 10);

// ---------- Assignments ----------
export async function saveAssignment(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const data = {
    locationId: String(form.get("locationId")),
    serviceTypeId: s(form, "serviceTypeId"),
    userId: s(form, "userId"),
    date: String(form.get("date")),
    startTime: String(form.get("startTime") || "09:00"),
    endTime: s(form, "endTime"),
    notes: s(form, "notes"),
  };
  const taskLabels = lines(s(form, "tasks"));
  const repeat = Math.min(Math.max(Number(form.get("repeatWeeks") || 0), 0), 26);
  if (id) {
    const prev = must(await sb.from("Assignment").select("tasks").eq("id", id).single(), "job") as Pick<Assignment, "tasks">;
    const tasks = taskLabels.map((label) => ({ label, done: prev.tasks?.find((t) => t.label === label)?.done ?? false }));
    must(await sb.from("Assignment").update({ ...data, tasks }).eq("id", id), "save job");
    return done(`/jobs/${id}`);
  }
  const tasks = taskLabels.map((label) => ({ label, done: false }));
  const rows = Array.from({ length: repeat + 1 }, (_, w) => ({ ...data, date: addDays(data.date, w * 7), tasks, createdById: me.id }));
  must(await sb.from("Assignment").insert(rows), "create job");
  done("/jobs");
}

export async function setAssignmentStatus(id: string, status: "SCHEDULED" | "CANCELLED" | "MISSED" | "COMPLETED") {
  await requireUser("MANAGER");
  must(await admin().from("Assignment").update({ status }).eq("id", id), "update job");
  revalidatePath("/", "layout");
}

// ---------- Locations / SOPs ----------
export async function saveLocation(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = {
    name: String(form.get("name")), address: String(form.get("address")),
    latitude: n(form, "latitude"), longitude: n(form, "longitude"), geofenceM: n(form, "geofenceM") ?? 150,
    accessNotes: s(form, "accessNotes"), clientId: s(form, "clientId"), active: form.get("active") !== "off",
  };
  const sb = admin();
  const loc = must(id ? await sb.from("Location").update(data).eq("id", id).select("id").single() : await sb.from("Location").insert(data).select("id").single(), "save location") as { id: string };
  done(`/locations/${loc.id}`);
}

export async function saveSop(form: FormData) {
  await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const data = { title: String(form.get("title")), category: s(form, "category") ?? "General", body: String(form.get("body") ?? ""), locationId: s(form, "locationId") };
  if (id) {
    const cur = must(await sb.from("Sop").select("version").eq("id", id).single(), "SOP") as { version: number };
    // A new version asks everyone to read it again.
    must(await sb.from("Sop").update({ ...data, version: cur.version + 1, updatedAt: new Date().toISOString() }).eq("id", id), "save SOP");
  } else must(await sb.from("Sop").insert(data), "add SOP");
  done(data.locationId ? `/locations/${data.locationId}` : "/sops");
}

// ---------- Floor plans ----------
export async function createLayout(form: FormData) {
  await requireUser("MANAGER");
  const locationId = String(form.get("locationId"));
  const sb = admin();
  const count = (await sb.from("Layout").select("id", { count: "exact", head: true }).eq("locationId", locationId)).count ?? 0;
  const l = must(await sb.from("Layout").insert({ locationId, name: s(form, "name") ?? "Floor plan", sortOrder: count }).select("id").single(), "add floor plan") as { id: string };
  done(`/locations/${locationId}/layouts/${l.id}`);
}

export type RoomInput = { id?: string; name: string; type: string; points: number[][]; color: string; customTasks: TaskDef[]; notes?: string | null };
export type LayoutInput = { name: string; aspect: number; image: { keep: true } | { remove: true } | { dataUrl: string }; rooms: RoomInput[] };

/** Saves the whole floor plan from the editor: image, rooms in cleaning order, their tasks. */
export async function saveLayout(layoutId: string, payload: LayoutInput) {
  await requireUser("MANAGER");
  const sb = admin();
  const cur = must(await sb.from("Layout").select("locationId, imagePath").eq("id", layoutId).single(), "floor plan") as { locationId: string; imagePath: string | null };
  let imagePath = cur.imagePath;
  if ("remove" in payload.image) imagePath = null;
  if ("dataUrl" in payload.image) imagePath = await uploadDataUrl(payload.image.dataUrl, `layouts/${layoutId}`);
  if (imagePath !== cur.imagePath) await removeImages([cur.imagePath]);
  must(await sb.from("Layout").update({ name: payload.name, aspect: payload.aspect, imagePath, updatedAt: new Date().toISOString() }).eq("id", layoutId), "save floor plan");

  // Rooms removed in the editor: their history (timers/checks/photos) goes with them by design.
  const keep = payload.rooms.map((r) => r.id).filter(Boolean) as string[];
  const del = sb.from("Room").delete().eq("layoutId", layoutId);
  must(keep.length ? await del.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`) : await del, "remove rooms");
  const clean = (r: RoomInput, i: number) => ({
    layoutId, name: r.name.trim() || "Room", type: r.type.trim() || "Other", points: r.points, color: r.color, notes: r.notes ?? null, sortOrder: i,
    customTasks: r.customTasks.filter((t) => t.label.trim()).map((t) => ({ label: t.label.trim(), serviceTypeIds: t.serviceTypeIds ?? [], minutes: t.minutes ?? null })),
  });
  const existing = payload.rooms.map((r, i) => ({ r, i })).filter(({ r }) => r.id);
  const fresh = payload.rooms.map((r, i) => ({ r, i })).filter(({ r }) => !r.id);
  if (existing.length) must(await sb.from("Room").upsert(existing.map(({ r, i }) => ({ id: r.id, ...clean(r, i) }))), "save rooms");
  if (fresh.length) must(await sb.from("Room").insert(fresh.map(({ r, i }) => clean(r, i))), "add rooms");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteLayout(layoutId: string) {
  await requireUser("MANAGER");
  const sb = admin();
  const l = must(await sb.from("Layout").select("locationId, imagePath").eq("id", layoutId).single(), "floor plan") as { locationId: string; imagePath: string | null };
  must(await sb.from("Layout").delete().eq("id", layoutId), "delete floor plan");
  await removeImages([l.imagePath]);
  done(`/locations/${l.locationId}`);
}

// ---------- Room type (common) tasks ----------
export async function addRoomTypeTask(form: FormData) {
  await requireUser("MANAGER");
  const roomType = String(form.get("roomType")).trim();
  const serviceTypeIds = form.getAll("serviceTypeIds").map(String).filter(Boolean);
  const minutes = n(form, "minutes");
  const sb = admin();
  const count = (await sb.from("RoomTypeTask").select("id", { count: "exact", head: true }).eq("roomType", roomType)).count ?? 0;
  const rows = lines(s(form, "labels")).map((label, i) => ({ roomType, label, serviceTypeIds, minutes, sortOrder: count + i }));
  if (rows.length) must(await sb.from("RoomTypeTask").insert(rows), "add tasks");
  done("/settings");
}
export async function updateRoomTypeTask(form: FormData) {
  await requireUser("MANAGER");
  must(await admin().from("RoomTypeTask").update({
    label: String(form.get("label")).trim(), minutes: n(form, "minutes"), serviceTypeIds: form.getAll("serviceTypeIds").map(String).filter(Boolean),
  }).eq("id", String(form.get("id"))), "save task");
  revalidatePath("/settings");
}
export async function deleteRoomTypeTask(id: string) {
  await requireUser("MANAGER");
  must(await admin().from("RoomTypeTask").delete().eq("id", id), "remove task");
  revalidatePath("/settings");
}

// ---------- Inventory ----------
export async function adjustStock(form: FormData) {
  const me = await requireUser("MANAGER");
  const delta = Math.trunc(Number(form.get("delta") || 0));
  if (!delta) return;
  must(await admin().rpc("adjust_stock", {
    p_supply: String(form.get("supplyId")), p_depot: String(form.get("depotId")), p_delta: delta, p_reason: String(form.get("reason") || "RESTOCK"), p_user: me.id,
  }), "adjust stock");
  revalidatePath("/inventory");
}

export async function saveSupply(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = { name: String(form.get("name")), sku: s(form, "sku"), unit: s(form, "unit") ?? "each", unitCost: n(form, "unitCost") ?? 0, reorderAt: n(form, "reorderAt") ?? 5 };
  must(id ? await admin().from("Supply").update(data).eq("id", id) : await admin().from("Supply").insert(data), "save supply");
  done("/inventory");
}

export async function saveDepot(form: FormData) {
  await requireUser("MANAGER");
  must(await admin().from("SupplyDepot").insert({
    name: String(form.get("name")), address: String(form.get("address")), latitude: n(form, "latitude"), longitude: n(form, "longitude"), geofenceM: n(form, "geofenceM") ?? 150,
  }), "add pickup location");
  done("/inventory");
}

// ---------- Time ----------
export async function approveTime(ids: string[]) {
  await requireUser("MANAGER");
  must(await admin().from("TimeEntry").update({ approved: true }).in("id", ids), "approve");
  revalidatePath("/time");
}

export async function editTime(form: FormData) {
  await requireUser("MANAGER");
  const out = s(form, "clockOut");
  // Edited entries need re-approval.
  must(await admin().from("TimeEntry").update({
    clockIn: fromLocalInput(String(form.get("clockIn"))).toISOString(), clockOut: out ? fromLocalInput(out).toISOString() : null, note: s(form, "note"), approved: false,
  }).eq("id", String(form.get("id"))), "save time");
  revalidatePath("/time");
}

// ---------- Issues / announcements ----------
export async function resolveIssue(id: string) {
  await requireUser("MANAGER");
  must(await admin().from("Issue").update({ status: "RESOLVED", resolvedAt: new Date().toISOString() }).eq("id", id), "resolve");
  revalidatePath("/", "layout");
}

export async function postAnnouncement(form: FormData) {
  await requireUser("MANAGER");
  must(await admin().from("Announcement").insert({ title: String(form.get("title")), body: String(form.get("body") ?? "") }), "post");
  done("/dashboard");
}

// ---------- Clients ----------
export async function saveClient(form: FormData) {
  await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const data = { name: String(form.get("name")), contactName: s(form, "contactName"), email: s(form, "email"), phone: s(form, "phone"), billingAddress: s(form, "billingAddress"), waveCustomerId: s(form, "waveCustomerId"), notes: s(form, "notes") };
  const client = must(id ? await sb.from("Client").update(data).eq("id", id).select("id").single() : await sb.from("Client").insert(data).select("id").single(), "save client") as { id: string };
  // Per-visit price for each service type: rate_<serviceTypeId>. Blank = not offered / not priced yet.
  const set: { clientId: string; serviceTypeId: string; price: number }[] = [];
  const unset: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("rate_")) continue;
    const val = String(v).trim();
    if (val === "") unset.push(k.slice(5)); else set.push({ clientId: client.id, serviceTypeId: k.slice(5), price: Number(val) });
  }
  if (set.length) must(await sb.from("ClientRate").upsert(set, { onConflict: "clientId,serviceTypeId" }), "save prices");
  if (unset.length) must(await sb.from("ClientRate").delete().eq("clientId", client.id).in("serviceTypeId", unset), "clear prices");
  done("/clients");
}

// ---------- Service types ----------
export async function saveServiceType(form: FormData) {
  await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const name = String(form.get("name")).trim();
  if (id) must(await sb.from("ServiceType").update({ name, active: form.get("active") !== "off" }).eq("id", id), "save service");
  else {
    const count = (await sb.from("ServiceType").select("id", { count: "exact", head: true })).count ?? 0;
    must(await sb.from("ServiceType").insert({ name, sortOrder: count }), "add service");
  }
  done("/settings");
}

// ---------- Team: Supabase Auth logins + staff profiles ----------
export async function saveUser(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  let role = (s(form, "role") ?? "STAFF") as Role;
  if (me.role !== "OWNER") role = "STAFF";
  const email = String(form.get("email")).trim().toLowerCase();
  const active = form.get("active") !== "off";
  const profile = {
    name: String(form.get("name")).trim(), email, phone: s(form, "phone"), role, waveEmployeeId: s(form, "waveEmployeeId"), active,
    ...(me.role === "OWNER" ? { hourlyRate: n(form, "hourlyRate") ?? 0 } : {}),
  };
  const pw = s(form, "password");
  if (pw && pw.length < 8) throw new Error("Passwords need at least 8 characters.");
  if (id) {
    if (me.role !== "OWNER") throw new Error("Only the owner can edit team members.");
    const { error } = await sb.auth.admin.updateUserById(id, {
      email, email_confirm: true, ...(pw ? { password: pw } : {}),
      ban_duration: active ? "none" : "876000h", // a deactivated login can't sign in
    });
    if (error) throw new Error(`Login update failed: ${error.message}`);
    must(await sb.from("User").update(profile).eq("id", id), "save team member");
  } else {
    if (!pw) throw new Error("Set a starting password (8+ characters).");
    const { data, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: profile.name } });
    if (error || !data.user) throw new Error(`Couldn't create the login: ${error?.message ?? "unknown error"}`);
    const ins = await sb.from("User").insert({ id: data.user.id, ...profile, hourlyRate: profile.hourlyRate ?? 0 });
    if (ins.error) {
      await sb.auth.admin.deleteUser(data.user.id); // don't leave a login without a profile
      throw new Error(`Couldn't save the team member: ${ins.error.message}`);
    }
  }
  done("/team");
}
