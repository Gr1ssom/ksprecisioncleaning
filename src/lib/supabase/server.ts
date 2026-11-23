import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Auth client bound to the request's cookies (sign in, sign out, who is signed in). */
export async function authClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

let adminSingleton: SupabaseClient | null = null;

/**
 * Server-only data client using the project's secret key (bypasses RLS, which denies the browser).
 * Every page and action checks the signed-in user's role with requireUser() before using it.
 */
export function admin(): SupabaseClient {
  if (adminSingleton) return adminSingleton;
  const key = process.env.SUPABASE_SECRET_KEY ?? "";
  adminSingleton = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // New-style secret keys (sb_secret_…) belong in the apikey header only; the API gateway
      // turns them into a service-role token. Keep them out of Authorization.
      fetch: (input, init) => {
        if (key.startsWith("sb_secret_") && init?.headers) {
          const h = new Headers(init.headers);
          if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          return fetch(input, { ...init, headers: h });
        }
        return fetch(input, init);
      },
    },
  });
  return adminSingleton;
}

/** Unwrap a supabase-js result, throwing on error so failures are never silent. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what = "query"): T {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data as T;
}
