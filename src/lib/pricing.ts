import "server-only";
import { admin, must } from "./supabase/server";
import type { ClientRate, ServiceType } from "./types";

/** Lookup of client per-visit prices: rate(clientId, serviceTypeId) → price, or null if not set. */
export async function rateBook() {
  const rates = must(await admin().from("ClientRate").select("*"), "rates") as ClientRate[];
  const map = new Map(rates.map((r) => [`${r.clientId}|${r.serviceTypeId}`, Number(r.price)]));
  return (clientId: string | null | undefined, serviceTypeId: string | null | undefined) =>
    clientId && serviceTypeId ? map.get(`${clientId}|${serviceTypeId}`) ?? null : null;
}

export async function serviceTypes(activeOnly = true) {
  let q = admin().from("ServiceType").select("*").order("sortOrder").order("name");
  if (activeOnly) q = q.eq("active", true);
  return must(await q, "service types") as ServiceType[];
}
