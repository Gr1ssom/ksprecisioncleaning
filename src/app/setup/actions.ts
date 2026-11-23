"use server";
import { redirect } from "next/navigation";
import { admin, authClient } from "@/lib/supabase/server";

/** First-run only: creates the owner when the app has no users yet. */
export async function createFirstOwner(_: unknown, form: FormData) {
  const sb = admin();
  const { count } = await sb.from("User").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) redirect("/login");
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!name || !email) return { error: "Enter your name and email." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) return { error: `Couldn't create the login: ${error?.message ?? "unknown error"}` };
  const ins = await sb.from("User").insert({ id: data.user.id, name, email, role: "OWNER", active: true });
  if (ins.error) {
    await sb.auth.admin.deleteUser(data.user.id);
    return { error: `Couldn't save your profile: ${ins.error.message}` };
  }
  await (await authClient()).auth.signInWithPassword({ email, password });
  redirect("/dashboard");
}
