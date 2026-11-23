import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { admin, authClient } from "./supabase/server";
import { atLeast, type Role } from "./session";
import type { Profile } from "./types";

/** The signed-in Supabase Auth user + their staff profile (row in "User"), once per request. */
export const currentUser = cache(async (): Promise<Profile | null> => {
  const sb = await authClient();
  const { data } = await sb.auth.getUser(); // verifies the token with Supabase Auth
  if (!data.user) return null;
  // 2-step sign-in: someone who turned it on must have entered their code this session.
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/verify");
  const { data: profile } = await admin().from("User").select("*").eq("id", data.user.id).maybeSingle();
  // A new login or a temporary password: they choose their own before going any further.
  if ((profile as Profile | null)?.mustChangePassword) redirect("/reset?first=1");
  return (profile as Profile | null) ?? null;
});

/** Require a signed-in, active user with at least `min` role. */
export async function requireUser(min: Role = "STAFF"): Promise<Profile> {
  const user = await currentUser();
  if (!user || !user.active) redirect("/login");
  if (!atLeast(user.role, min)) redirect("/dashboard");
  return user;
}
