"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { removeImages, uploadDataUrl } from "@/lib/storage";
import { audit, diff } from "@/lib/audit";
import type { Role } from "@/lib/session";
import { assignableRoles, canManage } from "@/lib/team";
import type { Assignment, Profile, TaskDef } from "@/lib/types";

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
  const me = await requireUser("MANAGER");
  const prev = must(await admin().from("Assignment").select("status, date, location:Location(name)").eq("id", id).single(), "job") as unknown as { status: string; date: string; location: { name: string } };
  must(await admin().from("Assignment").update({ status }).eq("id", id), "update job");
  await audit(me, "job.status", "Assignment", id, `Job at ${prev.location.name} on ${prev.date}: ${prev.status.toLowerCase()} → ${status.toLowerCase()}`, { before: { status: prev.status }, after: { status } });
  revalidatePath("/", "layout");
}

// ---------- Locations / SOPs ----------
export async function saveLocation(form: FormData) {
  const me = await requireUser("MANAGER");
  const id = s(form, "id");
  const data = {
    name: String(form.get("name")), address: String(form.get("address")),
    latitude: n(form, "latitude"), longitude: n(form, "longitude"), geofenceM: n(form, "geofenceM") ?? 150,
    accessNotes: s(form, "accessNotes"), clientId: s(form, "clientId"), active: form.get("active") !== "off",
  };
  const sb = admin();
  const prev = id ? (must(await sb.from("Location").select("name, address, latitude, longitude, geofenceM, clientId, active").eq("id", id).single(), "location") as Record<string, unknown>) : null;
  const loc = must(id ? await sb.from("Location").update(data).eq("id", id).select("id").single() : await sb.from("Location").insert(data).select("id").single(), "save location") as { id: string };
  const ch = diff(prev, data);
  if (!id || ch.after) await audit(me, id ? "location.update" : "location.create", "Location", loc.id, `${id ? "Updated" : "Added"} location ${data.name}${id && ch.after ? ` (${Object.keys(ch.after).join(", ")})` : ""}`, ch);
  done(`/locations/${loc.id}`);
}

export async function saveSop(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const data = { title: String(form.get("title")), category: s(form, "category") ?? "General", body: String(form.get("body") ?? ""), locationId: s(form, "locationId") };
  if (id) {
    const cur = must(await sb.from("Sop").select("version").eq("id", id).single(), "SOP") as { version: number };
    // A new version asks everyone to read it again.
    must(await sb.from("Sop").update({ ...data, version: cur.version + 1, updatedAt: new Date().toISOString() }).eq("id", id), "save SOP");
    await audit(me, "sop.update", "Sop", id, `SOP "${data.title}" saved as version ${cur.version + 1}`);
  } else {
    const row = must(await sb.from("Sop").insert(data).select("id").single(), "add SOP") as { id: string };
    await audit(me, "sop.create", "Sop", row.id, `Added SOP "${data.title}"`);
  }
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
  const supplyId = String(form.get("supplyId")), depotId = String(form.get("depotId")), reason = String(form.get("reason") || "RESTOCK");
  must(await admin().rpc("adjust_stock", { p_supply: supplyId, p_depot: depotId, p_delta: delta, p_reason: reason, p_user: me.id }), "adjust stock");
  const names = await Promise.all([admin().from("Supply").select("name").eq("id", supplyId).single(), admin().from("SupplyDepot").select("name").eq("id", depotId).single()]);
  await audit(me, "stock.adjust", "Supply", supplyId, `${reason.toLowerCase()} ${delta > 0 ? "+" : ""}${delta} ${names[0].data?.name ?? "supply"} at ${names[1].data?.name ?? "pickup location"}`, { after: { delta, reason, depotId } });
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
  const me = await requireUser("MANAGER");
  must(await admin().from("TimeEntry").update({ approved: true }).in("id", ids), "approve");
  await audit(me, "time.approve", "TimeEntry", ids.length === 1 ? ids[0] : null, `Approved ${ids.length} time ${ids.length === 1 ? "entry" : "entries"}`, { after: { ids } });
  revalidatePath("/time");
}

export async function editTime(form: FormData) {
  const me = await requireUser("MANAGER");
  const id = String(form.get("id"));
  const out = s(form, "clockOut");
  const prev = must(await admin().from("TimeEntry").select("clockIn, clockOut, note, user:User!TimeEntry_userId_fkey(name)").eq("id", id).single(), "time entry") as unknown as { clockIn: string; clockOut: string | null; note: string | null; user: { name: string } };
  const next = { clockIn: fromLocalInput(String(form.get("clockIn"))).toISOString(), clockOut: out ? fromLocalInput(out).toISOString() : null, note: s(form, "note") };
  // Edited entries need re-approval.
  must(await admin().from("TimeEntry").update({ ...next, approved: false }).eq("id", id), "save time");
  // The form edits to the minute, so compare to the minute (no phantom "changed by 53 seconds").
  const norm = (v: string | null) => (v ? new Date(Math.floor(Date.parse(v) / 60000) * 60000).toISOString() : null);
  const ch = diff({ clockIn: norm(prev.clockIn), clockOut: norm(prev.clockOut), note: prev.note }, { ...next, clockIn: norm(next.clockIn), clockOut: norm(next.clockOut) });
  if (ch.after) await audit(me, "time.edit", "TimeEntry", id, `Edited ${prev.user.name}'s hours${next.note ? `: ${next.note}` : ""}`, ch);
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
  const me = await requireUser("MANAGER");
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
  const before = Object.fromEntries((must(await sb.from("ClientRate").select("serviceTypeId, price").eq("clientId", client.id), "prices") as { serviceTypeId: string; price: number }[]).map((r) => [r.serviceTypeId, Number(r.price)]));
  if (set.length) must(await sb.from("ClientRate").upsert(set, { onConflict: "clientId,serviceTypeId" }), "save prices");
  if (unset.length) must(await sb.from("ClientRate").delete().eq("clientId", client.id).in("serviceTypeId", unset), "clear prices");
  const after: Record<string, number | null> = { ...before };
  for (const r of set) after[r.serviceTypeId] = r.price;
  for (const u of unset) after[u] = null;
  // Log prices by service name ("Deep clean: 420 → 450"), not internal ids.
  const names = Object.fromEntries((must(await sb.from("ServiceType").select("id, name"), "services") as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const byName = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [names[k] ?? k, v]));
  const ch = diff(byName(before), byName(Object.fromEntries(Object.entries(after).filter(([k, v]) => v !== null || k in before))));
  if (!id) await audit(me, "client.create", "Client", client.id, `Added client ${data.name}`, { after: ch.after });
  else if (ch.after) await audit(me, "client.prices", "Client", client.id, `Changed prices for ${data.name}`, ch);
  done("/clients");
}

// ---------- Service types ----------
export async function saveServiceType(form: FormData) {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const name = String(form.get("name")).trim();
  if (id) {
    must(await sb.from("ServiceType").update({ name, active: form.get("active") !== "off" }).eq("id", id), "save service");
    await audit(me, "service.update", "ServiceType", id, `Service "${name}" ${form.get("active") === "off" ? "retired" : "saved"}`);
  }
  else {
    const count = (await sb.from("ServiceType").select("id", { count: "exact", head: true })).count ?? 0;
    must(await sb.from("ServiceType").insert({ name, sortOrder: count }), "add service");
  }
  done("/settings");
}

// ---------- Team: Supabase Auth logins + staff profiles ----------
type TeamResult = { error?: string; ok?: string; tempPassword?: string };

async function loadTarget(id: string) {
  return must(await admin().from("User").select("*").eq("id", id).single(), "team member") as Profile;
}
async function ownerCount() {
  return (await admin().from("User").select("id", { count: "exact", head: true }).eq("role", "OWNER").eq("active", true)).count ?? 0;
}
/** Has this person any work history (which must be kept for payroll and records)? */
async function hasHistory(id: string) {
  const sb = admin();
  const counts = await Promise.all([
    sb.from("TimeEntry").select("id", { count: "exact", head: true }).eq("userId", id),
    sb.from("Checkin").select("id", { count: "exact", head: true }).eq("userId", id),
    sb.from("Assignment").select("id", { count: "exact", head: true }).eq("userId", id),
    sb.from("Issue").select("id", { count: "exact", head: true }).eq("reportedById", id),
    sb.from("RoomSession").select("id", { count: "exact", head: true }).eq("userId", id),
    sb.from("RoomPhoto").select("id", { count: "exact", head: true }).eq("userId", id),
  ]);
  return counts.some((c) => (c.count ?? 0) > 0);
}

/** Add an employee (creates their Supabase login, email already confirmed) or update one. */
export async function saveUser(_: unknown, form: FormData): Promise<TeamResult> {
  const me = await requireUser("MANAGER");
  const sb = admin();
  const id = s(form, "id");
  const role = (s(form, "role") ?? "STAFF") as Role;
  if (!assignableRoles(me).includes(role)) return { error: "You can't give that access level. Ask the owner." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  if (!name || !email) return { error: "Enter a name and an email." };
  const profile: Record<string, unknown> = { name, email, phone: s(form, "phone"), role, waveEmployeeId: s(form, "waveEmployeeId") };
  if (me.role === "OWNER" && form.has("hourlyRate")) profile.hourlyRate = n(form, "hourlyRate") ?? 0;
  const pw = s(form, "password");
  // A password a manager typed is one they know: ask for a new one at next sign-in unless unticked.
  if (pw) profile.mustChangePassword = form.get("mustChange") === "on";
  if (pw && pw.length < 8) return { error: "Passwords need at least 8 characters." };

  if (id) {
    const target = await loadTarget(id);
    if (!canManage(me, target) && target.id !== me.id) return { error: "You can't edit this person. Ask the owner." };
    if (target.id === me.id && role !== me.role) return { error: "You can't change your own access level." };
    if (target.role === "OWNER" && role !== "OWNER" && (await ownerCount()) <= 1) return { error: "This is the only owner. Make someone else an owner first." };
    const { error } = await sb.auth.admin.updateUserById(id, { email, email_confirm: true, ...(pw ? { password: pw } : {}) });
    if (error) return { error: `Couldn't update the login: ${error.message}` };
    const up = await sb.from("User").update(profile).eq("id", id);
    if (up.error) return { error: `Couldn't save: ${up.error.message}` };
    const ch = diff(target as unknown as Record<string, unknown>, profile);
    if (ch.after || pw) await audit(me, "user.update", "User", id, `Updated ${name}${ch.after ? ` (${Object.keys(ch.after).join(", ")})` : ""}${pw ? "; set a new password" : ""}`, ch);
    revalidatePath("/team", "layout");
    return { ok: "Saved." };
  }

  if (!pw) return { error: "Set a starting password (8+ characters) and give it to them." };
  const { data, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) return { error: error?.message?.includes("already") ? "Someone already uses that email." : `Couldn't create the login: ${error?.message ?? "unknown error"}` };
  const ins = await sb.from("User").insert({ id: data.user.id, hourlyRate: 0, ...profile });
  if (ins.error) {
    await sb.auth.admin.deleteUser(data.user.id); // don't leave a login without a profile
    return { error: `Couldn't save the team member: ${ins.error.message}` };
  }
  await audit(me, "user.create", "User", data.user.id, `Added ${name} as ${role.toLowerCase()}`, { after: profile });
  revalidatePath("/team", "layout");
  redirect(`/team/${data.user.id}?added=1`);
}

/** Turn a login off (blocked at Supabase Auth, history kept) or back on. */
export async function setUserActive(id: string, active: boolean): Promise<TeamResult> {
  const me = await requireUser("MANAGER");
  const target = await loadTarget(id);
  if (target.id === me.id) return { error: "You can't turn off your own login." };
  if (!canManage(me, target)) return { error: "You can't change this person. Ask the owner." };
  if (!active && target.role === "OWNER" && (await ownerCount()) <= 1) return { error: "This is the only owner and can't be turned off." };
  const { error } = await admin().auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  if (error) return { error: `Couldn't update the login: ${error.message}` };
  must(await admin().from("User").update({ active }).eq("id", id), "save status");
  await audit(me, active ? "user.activate" : "user.deactivate", "User", id, `${active ? "Turned on" : "Turned off"} ${target.name}'s login`);
  revalidatePath("/team", "layout");
  return { ok: active ? "Login turned back on." : "Login turned off. Their history is kept." };
}

/** Set a temporary password for someone who's locked out. Returned once to show the manager. */
export async function resetPassword(id: string): Promise<TeamResult> {
  const me = await requireUser("MANAGER");
  const target = await loadTarget(id);
  if (!canManage(me, target)) return { error: "You can't reset this person's password. Ask the owner." };
  const words = ["Mop", "Shine", "Fresh", "Sparkle", "Clean", "Polish", "Bright", "Tidy"];
  const temp = `${words[Math.floor(Math.random() * words.length)]}-${crypto.randomUUID().slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { error } = await admin().auth.admin.updateUserById(id, { password: temp });
  if (error) return { error: `Couldn't reset the password: ${error.message}` };
  must(await admin().from("User").update({ mustChangePassword: true }).eq("id", id), "save password status");
  await audit(me, "user.password_reset", "User", id, `Set a temporary password for ${target.name}`); // never the password itself
  return { ok: "Temporary password set. Give it to them; they'll choose their own when they sign in.", tempPassword: temp };
}

/** Remove someone. With work history they're turned off instead (records are kept for payroll). */
export async function removeUser(id: string): Promise<TeamResult> {
  const me = await requireUser("MANAGER");
  const target = await loadTarget(id);
  if (target.id === me.id) return { error: "You can't remove yourself." };
  if (!canManage(me, target)) return { error: "You can't remove this person. Ask the owner." };
  if (target.role === "OWNER" && (await ownerCount()) <= 1) return { error: "This is the only owner and can't be removed." };
  if (await hasHistory(id)) {
    const r = await setUserActive(id, false);
    return r.error ? r : { ok: "They have work history, so their login was turned off instead of deleted. Hours and jobs stay for payroll." };
  }
  const sb = admin();
  await sb.from("SopAck").delete().eq("userId", id);
  await sb.from("Assignment").update({ createdById: null }).eq("createdById", id);
  must(await sb.from("User").delete().eq("id", id), "remove profile");
  await audit(me, "user.remove", "User", id, `Removed ${target.name} (${target.email}); no work history`, { before: { name: target.name, email: target.email, role: target.role } });
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) return { error: `Profile removed, but the login couldn't be deleted: ${error.message}` };
  revalidatePath("/team", "layout");
  redirect("/team?removed=1");
}
