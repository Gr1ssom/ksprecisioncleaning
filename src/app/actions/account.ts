"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type R = { error?: string; ok?: string } | null;

async function origin() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Email a reset link. Always answers the same way, so it never reveals who has a login. */
export async function requestReset(_: R, form: FormData): Promise<R> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter the email you sign in with." };
  const sb = await authClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/confirm?next=/reset` });
  if (error && /rate|seconds/i.test(error.message)) return { error: "Too many reset emails. Wait a minute, then try again." };
  return { ok: "If that email has a login, a reset link is on its way. Check your inbox and spam folder." };
}

/** Set a new password for the signed-in user (after a reset link, or from My account). */
export async function setNewPassword(_: R, form: FormData): Promise<R> {
  const pw = String(form.get("password") ?? ""), again = String(form.get("again") ?? "");
  if (pw.length < 8) return { error: "Use at least 8 characters." };
  if (pw !== again) return { error: "The two passwords don't match. Type them again." };
  const sb = await authClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Ask for a new one." };
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) return { error: /same/i.test(error.message) ? "That's your current password. Pick a new one." : /aal2|AAL2/.test(error.message) ? "Enter your 2-step code first, then change your password." : `Couldn't change the password: ${error.message}` };
  await audit({ id: data.user.id }, "account.password", "User", data.user.id, "Changed their own password");
  if (form.get("from") === "reset") redirect("/dashboard");
  return { ok: "Password changed." };
}

// ---------- 2-step sign-in (TOTP authenticator app) ----------

export async function startTwoStep(): Promise<{ error?: string; factorId?: string; qr?: string; secret?: string }> {
  await requireUser();
  const sb = await authClient();
  // Clear any half-finished setup so a fresh QR code can be shown.
  const { data: list } = await sb.auth.mfa.listFactors();
  for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `KS app ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: `Couldn't start 2-step sign-in: ${error?.message ?? "unknown error"}` };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTwoStep(factorId: string, code: string): Promise<R> {
  const me = await requireUser();
  const sb = await authClient();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
  if (error) return { error: "That code didn't match. Check your phone's clock is right and try the newest code." };
  await audit(me, "account.2step_on", "User", me.id, "Turned on 2-step sign-in");
  revalidatePath("/account");
  return { ok: "2-step sign-in is on. You'll enter a code from your app each time you sign in." };
}

export async function removeTwoStep(factorId: string): Promise<R> {
  const me = await requireUser();
  const sb = await authClient();
  const { error } = await sb.auth.mfa.unenroll({ factorId });
  if (error) return { error: `Couldn't turn it off: ${error.message}` };
  await audit(me, "account.2step_off", "User", me.id, "Turned off 2-step sign-in");
  revalidatePath("/account");
  return { ok: "2-step sign-in is off." };
}

/** Second step of signing in: check the authenticator code. */
export async function verifySignInCode(_: R, form: FormData): Promise<R> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  const sb = await authClient();
  const { data } = await sb.auth.mfa.listFactors();
  const factor = data?.totp?.[0];
  if (!factor) redirect("/dashboard");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "That code didn't match. Try the newest code in your app." };
  redirect("/dashboard");
}
