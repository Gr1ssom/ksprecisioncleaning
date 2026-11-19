"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/session";

export async function login(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  const token = await signSession({ uid: user.id, role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/dashboard");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
