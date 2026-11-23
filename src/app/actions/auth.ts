"use server";
import { redirect } from "next/navigation";
import { admin, authClient } from "@/lib/supabase/server";

export async function login(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const sb = await authClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error?.code === "user_banned") return { error: "This login is turned off. Ask your manager to turn it back on." };
  if (error || !data.user) return { error: "Wrong email or password. Try again, or ask your manager to reset it." };
  const { data: profile } = await admin().from("User").select("active, mustChangePassword").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) {
    await sb.auth.signOut();
    return { error: "This login is turned off. Ask the owner to reactivate it." };
  }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/verify");
  if (profile.mustChangePassword) redirect("/reset?first=1");
  redirect("/dashboard");
}

export async function logout() {
  const sb = await authClient();
  await sb.auth.signOut();
  redirect("/login");
}
