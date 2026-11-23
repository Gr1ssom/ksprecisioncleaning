import "server-only";
import { admin } from "./supabase/server";

/** Last sign-in per user id, from Supabase Auth. */
export async function lastSignIns(): Promise<Record<string, string | null>> {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  return Object.fromEntries((data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
}
