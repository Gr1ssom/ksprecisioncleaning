import "server-only";
import { cache } from "react";
import { admin, must } from "./supabase/server";
import { DEFAULT_RULES, type Rules } from "./worktime";

/** Owner settings with defaults for anything not saved yet (one read per request). */
export const getRules = cache(async (): Promise<Rules> => {
  const rows = must(await admin().from("Setting").select("key, value").in("key", Object.keys(DEFAULT_RULES)), "settings") as { key: keyof Rules; value: unknown }[];
  const r: Record<string, unknown> = { ...DEFAULT_RULES };
  for (const row of rows) if (typeof row.value === typeof DEFAULT_RULES[row.key]) r[row.key] = row.value;
  return r as Rules;
});

export async function getSetting<T>(key: string): Promise<T | null> {
  const row = must(await admin().from("Setting").select("value").eq("key", key).maybeSingle(), "setting") as { value: T } | null;
  return row?.value ?? null;
}

export async function setSettings(values: Record<string, unknown>) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value, updatedAt: new Date().toISOString() }));
  if (rows.length) must(await admin().from("Setting").upsert(rows, { onConflict: "key" }), "save settings");
}
