import "server-only";
import { db } from "./db";

/** Lookup of client per-visit prices: rate(clientId, serviceTypeId) → price, or null if not set. */
export async function rateBook() {
  const rates = await db.clientRate.findMany();
  const map = new Map(rates.map((r) => [`${r.clientId}|${r.serviceTypeId}`, Number(r.price)]));
  return (clientId: string | null | undefined, serviceTypeId: string | null | undefined) =>
    clientId && serviceTypeId ? map.get(`${clientId}|${serviceTypeId}`) ?? null : null;
}

export const activeServiceTypes = () => db.serviceType.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
