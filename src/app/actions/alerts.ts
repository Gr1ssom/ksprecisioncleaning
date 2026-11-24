"use server";
import { revalidatePath } from "next/cache";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/notify";

export async function markAllRead() {
  const me = await requireUser();
  must(await admin().from("Notification").update({ readAt: new Date().toISOString() }).eq("userId", me.id).is("readAt", null), "mark read");
  revalidatePath("/", "layout");
}

/** Save this phone's push subscription (the browser made it with our public key). */
export async function savePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string) {
  const me = await requireUser();
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "This phone gave an unusable subscription. Try again." };
  must(await admin().from("PushSubscription").upsert(
    { userId: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 200) },
    { onConflict: "endpoint" },
  ), "save phone");
  return { ok: true };
}

export async function removePush(endpoint: string) {
  const me = await requireUser();
  must(await admin().from("PushSubscription").delete().eq("endpoint", endpoint).eq("userId", me.id), "remove phone");
  return { ok: true };
}

export async function testPush() {
  const me = await requireUser();
  await notify([me.id], { kind: "test", title: "Notifications are on", body: "You'll get job and shift alerts on this phone.", url: "/notifications" });
  revalidatePath("/", "layout");
}
