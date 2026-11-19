"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Role } from "@/lib/session";
import { fromLocalInput } from "@/lib/format";

const s = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v); };
const lines = (v: string | null) => (v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
const done = (path: string) => { revalidatePath("/", "layout"); redirect(path); };

// ---------- Assignments ----------
export async function saveAssignment(form: FormData) {
  const me = await requireUser("MANAGER");
  const id = s(form, "id");
  const data = {
    locationId: String(form.get("locationId")),
    serviceTypeId: s(form, "serviceTypeId"),
    userId: s(form, "userId"),
    date: new Date(String(form.get("date")) + "T00:00:00Z"),
    startTime: String(form.get("startTime") || "09:00"),
    endTime: s(form, "endTime"),
    notes: s(form, "notes"),
  };
  const taskLabels = lines(s(form, "tasks"));
  const repeat = Math.min(Math.max(Number(form.get("repeatWeeks") || 0), 0), 26);
  if (id) {
    const prev = await db.assignment.findUniqueOrThrow({ where: { id } });
    const old = (prev.tasks as { label: string; done: boolean }[]) ?? [];
    const tasks = taskLabels.map((label) => ({ label, done: old.find((t) => t.label === label)?.done ?? false }));
    await db.assignment.update({ where: { id }, data: { ...data, tasks } });
    return done(`/jobs/${id}`);
  }
  const tasks = taskLabels.map((label) => ({ label, done: false }));
  for (let w = 0; w <= repeat; w++) {
    await db.assignment.create({ data: { ...data, date: new Date(data.date.getTime() + w * 7 * 86400_000), tasks, createdById: me.id } });
  }
  done("/jobs");
}

export async function setAssignmentStatus(id: string, status: "SCHEDULED" | "CANCELLED" | "MISSED" | "COMPLETED") {
  await requireUser("MANAGER");
  await db.assignment.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
}

// ---------- Locations / SOPs / layouts ----------
export async function saveLocation(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = {
    name: String(form.get("name")), address: String(form.get("address")),
    latitude: n(form, "latitude"), longitude: n(form, "longitude"), geofenceM: n(form, "geofenceM") ?? 150,
    accessNotes: s(form, "accessNotes"), clientId: s(form, "clientId"),
    active: form.get("active") !== "off",
  };
  const loc = id ? await db.location.update({ where: { id }, data }) : await db.location.create({ data });
  done(`/locations/${loc.id}`);
}

export async function saveSop(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = { title: String(form.get("title")), category: s(form, "category") ?? "General", body: String(form.get("body") ?? ""), locationId: s(form, "locationId") };
  if (id) await db.sop.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  else await db.sop.create({ data });
  done(data.locationId ? `/locations/${data.locationId}` : "/sops");
}

export async function createLayout(form: FormData) {
  await requireUser("MANAGER");
  const locationId = String(form.get("locationId"));
  const l = await db.layout.create({ data: { locationId, name: s(form, "name") ?? "Floor plan" } });
  done(`/locations/${locationId}/layouts/${l.id}`);
}

type RoomInput = { id?: string; name: string; type: string; points: number[][]; color: string; customTasks: string[]; notes?: string | null };

/** Saves the whole traced layout from the editor in one go. */
export async function saveLayout(layoutId: string, payload: { name: string; imageData: string | null; aspect: number; rooms: RoomInput[] }) {
  await requireUser("MANAGER");
  const existing = await db.room.findMany({ where: { layoutId }, select: { id: true } });
  const keep = new Set(payload.rooms.map((r) => r.id).filter(Boolean));
  await db.$transaction([
    db.layout.update({ where: { id: layoutId }, data: { name: payload.name, imageData: payload.imageData, aspect: payload.aspect } }),
    // Rooms removed in the editor: their history (timers/checks) goes with them by design.
    db.room.deleteMany({ where: { layoutId, id: { in: existing.map((e) => e.id).filter((id) => !keep.has(id)) } } }),
    ...payload.rooms.map((r) => {
      const data = { name: r.name || "Room", type: r.type, points: r.points, color: r.color, customTasks: r.customTasks, notes: r.notes ?? null };
      return r.id ? db.room.update({ where: { id: r.id }, data }) : db.room.create({ data: { ...data, layoutId } });
    }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteLayout(layoutId: string) {
  await requireUser("MANAGER");
  const l = await db.layout.delete({ where: { id: layoutId } });
  done(`/locations/${l.locationId}`);
}

// ---------- Room type (common) tasks ----------
export async function addRoomTypeTask(form: FormData) {
  await requireUser("MANAGER");
  const roomType = String(form.get("roomType")).trim();
  for (const label of lines(s(form, "labels"))) await db.roomTypeTask.create({ data: { roomType, label } });
  done("/settings");
}
export async function deleteRoomTypeTask(id: string) {
  await requireUser("MANAGER");
  await db.roomTypeTask.delete({ where: { id } });
  revalidatePath("/settings");
}

// ---------- Inventory ----------
export async function adjustStock(form: FormData) {
  const me = await requireUser("MANAGER");
  const supplyId = String(form.get("supplyId"));
  const depotId = String(form.get("depotId"));
  const delta = Math.trunc(Number(form.get("delta") || 0));
  const reason = String(form.get("reason") || "RESTOCK");
  if (!delta) return;
  await db.$transaction([
    db.stockLevel.upsert({ where: { supplyId_depotId: { supplyId, depotId } }, create: { supplyId, depotId, quantity: delta }, update: { quantity: { increment: delta } } }),
    db.stockMovement.create({ data: { supplyId, depotId, userId: me.id, delta, reason } }),
  ]);
  revalidatePath("/inventory");
}

export async function saveSupply(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = { name: String(form.get("name")), sku: s(form, "sku"), unit: s(form, "unit") ?? "each", unitCost: n(form, "unitCost") ?? 0, reorderAt: n(form, "reorderAt") ?? 5 };
  if (id) await db.supply.update({ where: { id }, data });
  else await db.supply.create({ data });
  done("/inventory");
}

export async function saveDepot(form: FormData) {
  await requireUser("MANAGER");
  await db.supplyDepot.create({
    data: { name: String(form.get("name")), address: String(form.get("address")), latitude: n(form, "latitude"), longitude: n(form, "longitude"), geofenceM: n(form, "geofenceM") ?? 150 },
  });
  done("/inventory");
}

// ---------- Time ----------
export async function approveTime(ids: string[]) {
  await requireUser("MANAGER");
  await db.timeEntry.updateMany({ where: { id: { in: ids } }, data: { approved: true } });
  revalidatePath("/time");
}

export async function editTime(form: FormData) {
  await requireUser("MANAGER");
  const id = String(form.get("id"));
  const clockIn = fromLocalInput(String(form.get("clockIn")));
  const out = s(form, "clockOut");
  // Edited entries need re-approval.
  await db.timeEntry.update({ where: { id }, data: { clockIn, clockOut: out ? fromLocalInput(out) : null, note: s(form, "note"), approved: false } });
  revalidatePath("/time");
}

// ---------- Issues / announcements ----------
export async function resolveIssue(id: string) {
  await requireUser("MANAGER");
  await db.issue.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function postAnnouncement(form: FormData) {
  await requireUser("MANAGER");
  await db.announcement.create({ data: { title: String(form.get("title")), body: String(form.get("body") ?? "") } });
  done("/dashboard");
}

// ---------- Clients ----------
export async function saveClient(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const data = { name: String(form.get("name")), contactName: s(form, "contactName"), email: s(form, "email"), phone: s(form, "phone"), billingAddress: s(form, "billingAddress"), waveCustomerId: s(form, "waveCustomerId"), notes: s(form, "notes") };
  const client = id ? await db.client.update({ where: { id }, data }) : await db.client.create({ data });
  // Per-visit price for each service type: rate_<serviceTypeId>. Blank = not offered / not priced yet.
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("rate_")) continue;
    const serviceTypeId = k.slice(5);
    const where = { clientId_serviceTypeId: { clientId: client.id, serviceTypeId } };
    const val = String(v).trim();
    if (val === "") await db.clientRate.deleteMany({ where: { clientId: client.id, serviceTypeId } });
    else await db.clientRate.upsert({ where, create: { clientId: client.id, serviceTypeId, price: Number(val) }, update: { price: Number(val) } });
  }
  done("/clients");
}

// ---------- Service types ----------
export async function saveServiceType(form: FormData) {
  await requireUser("MANAGER");
  const id = s(form, "id");
  const name = String(form.get("name")).trim();
  if (id) await db.serviceType.update({ where: { id }, data: { name, active: form.get("active") !== "off" } });
  else await db.serviceType.create({ data: { name, sortOrder: (await db.serviceType.count()) } });
  done("/settings");
}

// ---------- Team (owner manages roles/pay; managers can add staff) ----------
export async function saveUser(form: FormData) {
  const me = await requireUser("MANAGER");
  const id = s(form, "id");
  let role = (s(form, "role") ?? "STAFF") as Role;
  if (me.role !== "OWNER") role = "STAFF";
  const base = {
    name: String(form.get("name")), email: String(form.get("email")).toLowerCase(), phone: s(form, "phone"),
    role, waveEmployeeId: s(form, "waveEmployeeId"), active: form.get("active") !== "off",
    ...(me.role === "OWNER" ? { hourlyRate: n(form, "hourlyRate") ?? 0 } : {}),
  };
  const pw = s(form, "password");
  if (id) {
    if (me.role !== "OWNER") throw new Error("Only the owner can edit team members");
    await db.user.update({ where: { id }, data: { ...base, ...(pw ? { passwordHash: await bcrypt.hash(pw, 10) } : {}) } });
  } else {
    if (!pw) throw new Error("A starting password is required");
    await db.user.create({ data: { ...base, passwordHash: await bcrypt.hash(pw, 10) } });
  }
  done("/team");
}
