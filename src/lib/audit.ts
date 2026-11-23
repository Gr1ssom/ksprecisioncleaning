import "server-only";
import { admin } from "./supabase/server";

type Actor = { id: string } | null;

/** Only the fields that changed, so the log shows "price 185 → 200" rather than whole rows. */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined) {
  if (!before || !after) return { before: before ?? null, after: after ?? null };
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!(k in after)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: Object.keys(b).length ? b : null, after: Object.keys(a).length ? a : null };
}

/**
 * Record who changed what. Never throws: a failed log write must not fail the user's action.
 * Never pass passwords or keys in before/after.
 */
export async function audit(actor: Actor, action: string, entity: string, entityId: string | null, summary: string,
  change?: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }) {
  const { error } = await admin().from("AuditLog").insert({
    actorId: actor?.id ?? null, action, entity, entityId, summary,
    before: change?.before ?? null, after: change?.after ?? null,
  });
  if (error) console.error("audit log write failed:", error.message);
}
