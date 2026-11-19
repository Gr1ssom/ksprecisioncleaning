// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export type Role = "STAFF" | "MANAGER" | "OWNER";
export type SessionPayload = { uid: string; role: Role; name: string };

export const SESSION_COOKIE = "ks_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-insecure-secret");

export async function signSession(p: SessionPayload) {
  return new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(secret());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const ROLE_RANK: Record<Role, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };
export const atLeast = (role: Role, min: Role) => ROLE_RANK[role] >= ROLE_RANK[min];
