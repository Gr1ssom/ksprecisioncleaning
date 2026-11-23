import type { Instrumentation } from "next";

export function register() {}

/**
 * Server errors in production are written to the AppError table so the owner sees them on the
 * Activity page. Plain fetch (no app imports) so this hook stays tiny and can never throw.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || process.env.NODE_ENV !== "production") return;
  const e = err as Error & { digest?: string };
  // Redirects and not-found are control flow, not errors.
  if (e?.digest?.startsWith("NEXT_REDIRECT") || e?.digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return;
  try {
    await fetch(`${url}/rest/v1/AppError`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        message: String(e?.message ?? err).slice(0, 2000), digest: e?.digest ?? null,
        path: request.path?.split("?")[0]?.slice(0, 300) ?? null, method: request.method ?? null,
        kind: `${context.routeType}${context.renderSource ? ` · ${context.renderSource}` : ""}`,
      }),
    });
  } catch { /* never let error reporting cause another error */ }
};
