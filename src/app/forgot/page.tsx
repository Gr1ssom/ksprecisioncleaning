"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/AuthCard";
import { requestReset } from "../actions/account";

function Form() {
  const [state, action, pending] = useActionState(requestReset, null);
  const expired = useSearchParams().get("expired");
  return (
    <AuthCard heading="Reset password">
      {expired && !state && <p className="text-sm text-amber-700">That link has expired or was already used. Ask for a new one.</p>}
      {state?.ok ? (
        <p className="text-sm text-slate-700">{state.ok}</p>
      ) : (
        <form action={action} className="space-y-4">
          <p className="text-sm text-slate-600">Enter the email you sign in with. We&apos;ll send a link to set a new password.</p>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button className="btn-primary w-full py-2.5 uppercase tracking-[0.15em]" disabled={pending}>{pending ? "Sending…" : "Send link"}</button>
        </form>
      )}
      <Link href="/login" className="flex min-h-11 items-center justify-center text-sm text-slate-500 underline underline-offset-2">Back to sign in</Link>
    </AuthCard>
  );
}

export default function Forgot() {
  return <Suspense><Form /></Suspense>;
}
