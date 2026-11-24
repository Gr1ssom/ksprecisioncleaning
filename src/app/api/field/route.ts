import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { admin } from "@/lib/supabase/server";
import { clampAt, FieldError, runFieldOp, type FieldOp } from "@/lib/fieldOps";

const OPS = new Set(["checkIn", "checkOut", "startRoom", "stopRoom", "setRoomTask", "finishRoom", "setTask", "clock", "break"]);

/**
 * Field actions from the phone, sent straight away or replayed after being saved offline.
 * Each carries an id (applied once) and the time it happened on the phone.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !user.active) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as (FieldOp & { id?: string; at?: number; uid?: string }) | null;
  if (!body || typeof body.id !== "string" || !OPS.has(body.op)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  // Saved by someone else on this phone: never apply it as this person.
  if (body.uid && body.uid !== user.id) return NextResponse.json({ error: "Saved by a different sign-in on this phone." }, { status: 409 });
  const at = clampAt(body.at);
  const sb = admin();
  // Already applied (a retry after a lost reply): nothing to do.
  const claim = await sb.from("FieldOp").insert({ id: body.id, userId: user.id, op: body.op, at });
  if (claim.error) {
    if (claim.error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    throw claim.error;
  }
  try {
    await runFieldOp(user, body, at);
  } catch (e) {
    await sb.from("FieldOp").delete().eq("id", body.id); // not applied: allow a retry
    if (e instanceof FieldError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
