import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, verifySession, atLeast, type Role } from "./session";

export async function getSession() {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

/** Load the signed-in user, redirecting to /login (or /dashboard if under-privileged). */
export async function requireUser(min: Role = "STAFF") {
  const s = await getSession();
  if (!s) redirect("/login");
  const user = await db.user.findUnique({ where: { id: s.uid } });
  if (!user || !user.active) redirect("/login");
  if (!atLeast(user.role, min)) redirect("/dashboard");
  return user;
}
