import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/supabase/server";

/**
 * Landing page for email links (password reset). Handles both link styles:
 * token_hash (works on any device; set in the Supabase email template) and code (same browser only).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/dashboard";
  const sb = await authClient();
  const tokenHash = url.searchParams.get("token_hash"), type = url.searchParams.get("type") as EmailOtpType | null, code = url.searchParams.get("code");
  const { error } = tokenHash && type
    ? await sb.auth.verifyOtp({ type, token_hash: tokenHash })
    : code ? await sb.auth.exchangeCodeForSession(code) : { error: new Error("missing token") };
  const dest = url.clone();
  dest.search = "";
  if (error) { dest.pathname = "/forgot"; dest.searchParams.set("expired", "1"); }
  else dest.pathname = next;
  return NextResponse.redirect(dest);
}
