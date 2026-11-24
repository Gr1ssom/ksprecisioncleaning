"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { uploadImage } from "@/lib/storage";
import { FieldError, jobFor, pickup, runFieldOp, type FieldOp } from "@/lib/fieldOps";
import { leads, notify } from "@/lib/notify";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const geo = (f: FormData) => ({ lat: num(f.get("lat")), lng: num(f.get("lng")), acc: num(f.get("acc")) });
const str = (f: FormData, k: string) => (String(f.get(k) ?? "").trim() || null);

const now = () => new Date().toISOString();
async function op(f: FieldOp) {
  const user = await requireUser();
  try {
    return { user, res: await runFieldOp(user, f, now()) };
  } catch (e) {
    if (e instanceof FieldError) return { user, error: e.message };
    throw e;
  }
}
async function canTouch(assignmentId: string) {
  const user = await requireUser();
  return { user, a: await jobFor(user, assignmentId) };
}

/** Supply pickup check-in: GPS-verified at the depot + decrements stock (one transaction). */
export async function supplyPickup(form: FormData) {
  const user = await requireUser();
  const items = [...form.entries()]
    .filter(([k, v]) => k.startsWith("qty_") && Number(v) > 0)
    .map(([k, v]) => ({ supplyId: k.slice(4), qty: Math.floor(Number(v)) }));
  const fence = await pickup(user, String(form.get("depotId")), geo(form), str(form, "note"), items);
  revalidatePath("/", "layout");
  redirect(`/checkin?done=pickup&fence=${fence.withinFence ?? "na"}`);
}

export async function siteCheckIn(form: FormData) {
  const id = String(form.get("assignmentId"));
  const r = await op({ op: "checkIn", assignmentId: id, geo: geo(form), note: str(form, "note") });
  revalidatePath("/", "layout");
  if (r.error) redirect(`/checkin?error=${encodeURIComponent(r.error)}`);
  redirect(`/jobs/${id}`);
}

export async function siteCheckOut(form: FormData) {
  const id = String(form.get("assignmentId"));
  const r = await op({ op: "checkOut", assignmentId: id, geo: geo(form), note: str(form, "note") });
  revalidatePath("/", "layout");
  if (r.error) redirect(`/jobs/${id}?error=${encodeURIComponent(r.error)}`);
  redirect(`/jobs/${id}?done=1`);
}

/** Start or end the working day (shift clock). Returns an error to show, if any. */
export async function clockShift(form: FormData) {
  const on = form.get("on") === "1";
  const r = await op({ op: "clock", on, geo: geo(form) });
  revalidatePath("/", "layout");
  const back = str(form, "back") ?? "/dashboard";
  if (r.error) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(r.error)}`);
  redirect(back);
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
  const title = String(form.get("title"));
  must(await admin().from("Issue").insert({
    title, detail: str(form, "detail"), locationId: str(form, "locationId"), reportedById: user.id, photoPath,
  }), "report issue");
  await notify((await leads("both")).filter((id) => id !== user.id), { kind: "issue", title: `New issue: ${title}`, body: `Reported by ${user.name}.`, url: "/issues" });
  revalidatePath("/", "layout");
  redirect(str(form, "back") ?? "/issues");
}

export async function ackSop(sopId: string) {
  const user = await requireUser();
  const sop = must(await admin().from("Sop").select("version").eq("id", sopId).single(), "SOP") as { version: number };
  must(await admin().from("SopAck").upsert({ sopId, userId: user.id, version: sop.version }, { onConflict: "sopId,userId,version", ignoreDuplicates: true }), "mark read");
  revalidatePath("/sops");
}
