import "server-only";
import webpush from "web-push";
import { admin, must } from "./supabase/server";
import type { Role } from "./session";

/**
 * Notifications: a row in the person's in-app inbox (the bell), plus a phone push to every device
 * they turned notifications on for. Push keys are made by the app on first use and kept in
 * "AppSecret" (server only). Never throws: a failed alert must not fail the action that caused it.
 */
export type Note = { kind: string; title: string; body?: string | null; url?: string | null; dedupe?: string | null };

let vapid: { publicKey: string; privateKey: string } | null = null;
export async function pushKeys() {
  if (vapid) return vapid;
  const sb = admin();
  const read = async () => {
    const row = must(await sb.from("AppSecret").select("value").eq("key", "vapid").maybeSingle(), "push keys") as { value: string } | null;
    if (!row) return null;
    const k = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    return k.publicKey && k.privateKey ? k : null;
  };
  let keys = await read();
  for (let i = 0; !keys && i < 3; i++) {
    const k = webpush.generateVAPIDKeys();
    // One row holds both halves, written in one statement, so two servers racing can't mix pairs:
    // the first pair wins and both read it back.
    const ins = await sb.from("AppSecret").upsert({ key: "vapid", value: JSON.stringify(k) }, { onConflict: "key", ignoreDuplicates: true });
    if (ins.error) throw new Error(`Couldn't save phone-push keys: ${ins.error.message}`);
    keys = await read();
    if (!keys) await new Promise((r) => setTimeout(r, 200));
  }
  if (!keys) throw new Error("Phone-push keys are missing. Reload the page to try again.");
  vapid = keys;
  return keys;
}

export async function notify(userIds: (string | null | undefined)[], n: Note) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    const sb = admin();
    const rows = ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body ?? null, url: n.url ?? null, dedupe: n.dedupe ?? null }));
    // With a dedupe key, each person gets a given alert once (reminders run every 5 minutes).
    const ins = n.dedupe
      ? await sb.from("Notification").upsert(rows, { onConflict: "userId,dedupe", ignoreDuplicates: true }).select("userId")
      : await sb.from("Notification").insert(rows).select("userId");
    if (ins.error) throw ins.error;
    const sendTo = (ins.data ?? []).map((r) => r.userId as string);
    if (sendTo.length) await push(sendTo, n);
  } catch (e) {
    console.error("notify failed", e);
  }
}

async function push(userIds: string[], n: Note) {
  const sb = admin();
  const subs = must(await sb.from("PushSubscription").select("id, endpoint, p256dh, auth").in("userId", userIds), "push subscriptions") as { id: string; endpoint: string; p256dh: string; auth: string }[];
  if (!subs.length) return;
  const keys = await pushKeys();
  webpush.setVapidDetails("mailto:noreply@ksprecisioncleaning.app", keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/notifications", tag: n.dedupe ?? n.kind });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("PushSubscription").delete().eq("id", s.id); // phone unsubscribed
    }
  }));
}

/** Active people at or above a role ("managers" = managers and owners). */
export async function leads(who: "managers" | "owners" | "both" = "both") {
  const roles: Role[] = who === "owners" ? ["OWNER"] : who === "managers" ? ["MANAGER"] : ["MANAGER", "OWNER"];
  const rows = must(await admin().from("User").select("id").eq("active", true).in("role", roles), "managers") as { id: string }[];
  // No managers yet: alerts go to the owners instead of nowhere.
  if (!rows.length && who === "managers") return leads("owners");
  return rows.map((r) => r.id);
}

/** After stock goes down: tell managers about anything now at or below its reorder point. */
export async function notifyLowStock(depotId: string, supplyIds: string[]) {
  if (!supplyIds.length) return;
  try {
    const rows = must(await admin().from("StockLevel").select("quantity, supply:Supply(id, name, unit, reorderAt), depot:SupplyDepot(name)")
      .eq("depotId", depotId).in("supplyId", supplyIds), "stock") as unknown as { quantity: number; supply: { id: string; name: string; unit: string; reorderAt: number }; depot: { name: string } }[];
    const low = rows.filter((r) => r.quantity <= r.supply.reorderAt);
    if (!low.length) return;
    const to = await leads("both");
    for (const r of low) {
      await notify(to, {
        kind: "low_stock", title: `Low stock: ${r.supply.name}`, body: `${r.quantity} ${r.supply.unit} left at ${r.depot.name}.`, url: "/inventory",
        // Once per item per depot per day.
        dedupe: `low:${depotId}:${r.supply.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  } catch (e) {
    console.error("low stock alert failed", e);
  }
}
