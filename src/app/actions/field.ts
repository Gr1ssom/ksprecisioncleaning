"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fenceCheck } from "@/lib/geo";
import type { Task } from "@/lib/format";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const geo = (f: FormData) => ({ lat: num(f.get("lat")), lng: num(f.get("lng")), acc: num(f.get("acc")) });
const str = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);

async function canTouch(assignmentId: string) {
  const user = await requireUser();
  const a = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { location: true } });
  if (user.role === "STAFF" && a.userId !== user.id) throw new Error("Not your assignment");
  return { user, a };
}

/** Supply pickup check-in: GPS-verified at the depot + decrements stock. */
export async function supplyPickup(form: FormData) {
  const user = await requireUser();
  const depotId = String(form.get("depotId"));
  const depot = await db.supplyDepot.findUniqueOrThrow({ where: { id: depotId } });
  const g = geo(form);
  const fence = fenceCheck(g, depot);
  const items = [...form.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ supplyId: k.slice(4), qty: Math.floor(Number(v)) }));

  await db.$transaction(async (tx) => {
    await tx.checkin.create({
      data: { type: "SUPPLY_PICKUP", userId: user.id, depotId, latitude: g.lat, longitude: g.lng, accuracyM: g.acc, ...fence, note: str(form, "note") },
    });
    for (const it of items) {
      await tx.stockLevel.upsert({
        where: { supplyId_depotId: { supplyId: it.supplyId, depotId } },
        create: { supplyId: it.supplyId, depotId, quantity: -it.qty },
        update: { quantity: { decrement: it.qty } },
      });
      await tx.stockMovement.create({ data: { supplyId: it.supplyId, depotId, userId: user.id, delta: -it.qty, reason: "PICKUP" } });
    }
  });
  revalidatePath("/", "layout");
  redirect(`/checkin?done=pickup&fence=${fence.withinFence ?? "na"}`);
}

export async function siteCheckIn(form: FormData) {
  const { user, a } = await canTouch(String(form.get("assignmentId")));
  const g = geo(form);
  const fence = fenceCheck(g, a.location);
  await db.$transaction([
    db.checkin.create({
      data: { type: "SITE_IN", userId: user.id, locationId: a.locationId, assignmentId: a.id, latitude: g.lat, longitude: g.lng, accuracyM: g.acc, ...fence, note: str(form, "note") },
    }),
    db.assignment.update({ where: { id: a.id }, data: { status: "IN_PROGRESS", userId: a.userId ?? user.id } }),
    db.timeEntry.upsert({
      where: { assignmentId: a.id },
      create: { userId: user.id, assignmentId: a.id, clockIn: new Date() },
      update: { clockOut: null },
    }),
  ]);
  revalidatePath("/", "layout");
  redirect(`/jobs/${a.id}`);
}

export async function siteCheckOut(form: FormData) {
  const { user, a } = await canTouch(String(form.get("assignmentId")));
  const g = geo(form);
  const fence = fenceCheck(g, a.location);
  const now = new Date();
  await db.$transaction([
    db.checkin.create({
      data: { type: "SITE_OUT", userId: user.id, locationId: a.locationId, assignmentId: a.id, latitude: g.lat, longitude: g.lng, accuracyM: g.acc, ...fence, note: str(form, "note") },
    }),
    db.roomSession.updateMany({ where: { assignmentId: a.id, endedAt: null }, data: { endedAt: now } }),
    db.timeEntry.updateMany({ where: { assignmentId: a.id, clockOut: null }, data: { clockOut: now } }),
    db.assignment.update({ where: { id: a.id }, data: { status: "COMPLETED" } }),
  ]);
  revalidatePath("/", "layout");
  redirect(`/jobs/${a.id}?done=1`);
}

export async function toggleTask(assignmentId: string, index: number) {
  const { a } = await canTouch(assignmentId);
  const tasks = (a.tasks as Task[]) ?? [];
  if (tasks[index]) tasks[index].done = !tasks[index].done;
  await db.assignment.update({ where: { id: a.id }, data: { tasks } });
  revalidatePath(`/jobs/${a.id}`);
}

/** Start the timer for a room. Only one room runs at a time per person per job. */
export async function startRoom(assignmentId: string, roomId: string) {
  const { user, a } = await canTouch(assignmentId);
  const now = new Date();
  await db.$transaction([
    db.roomSession.updateMany({ where: { assignmentId: a.id, userId: user.id, endedAt: null }, data: { endedAt: now } }),
    db.roomSession.create({ data: { assignmentId: a.id, roomId, userId: user.id, startedAt: now } }),
  ]);
  revalidatePath(`/jobs/${a.id}`);
}

export async function stopRoom(assignmentId: string) {
  const { user, a } = await canTouch(assignmentId);
  await db.roomSession.updateMany({ where: { assignmentId: a.id, userId: user.id, endedAt: null }, data: { endedAt: new Date() } });
  revalidatePath(`/jobs/${a.id}`);
}

export async function toggleRoomTask(assignmentId: string, roomId: string, label: string) {
  const { user, a } = await canTouch(assignmentId);
  const key = { assignmentId_roomId_label: { assignmentId: a.id, roomId, label } };
  const existing = await db.roomTaskCheck.findUnique({ where: key });
  if (existing) await db.roomTaskCheck.delete({ where: key });
  else await db.roomTaskCheck.create({ data: { assignmentId: a.id, roomId, label, userId: user.id } });
  revalidatePath(`/jobs/${a.id}`);
}

export async function reportIssue(form: FormData) {
  const user = await requireUser();
  const photo = form.get("photo");
  let photoData: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 4_000_000) throw new Error("Photo too large (max 4MB)");
    photoData = `data:${photo.type};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
  }
  await db.issue.create({
    data: { title: String(form.get("title")), detail: str(form, "detail"), locationId: str(form, "locationId"), reportedById: user.id, photoData },
  });
  revalidatePath("/", "layout");
  const back = str(form, "back");
  redirect(back ?? "/issues");
}

export async function ackSop(sopId: string) {
  const user = await requireUser();
  const sop = await db.sop.findUniqueOrThrow({ where: { id: sopId } });
  await db.sopAck.upsert({
    where: { sopId_userId_version: { sopId, userId: user.id, version: sop.version } },
    create: { sopId, userId: user.id, version: sop.version },
    update: {},
  });
  revalidatePath("/sops");
}
