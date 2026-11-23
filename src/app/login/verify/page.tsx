"use client";
import { useActionState } from "react";
import { AuthCard } from "@/components/AuthCard";
import { verifySignInCode } from "../../actions/account";
import { logout } from "../../actions/auth";

export default function VerifyCode() {
  const [state, action, pending] = useActionState(verifySignInCode, null);
  return (
    <AuthCard heading="2-step sign-in">
      <form action={action} className="space-y-4">
        <p className="text-sm text-slate-600">Open your authenticator app and enter the 6-digit code for KS Precision Cleaning.</p>
        <div>
          <label className="label" htmlFor="code">Code</label>
          <input className="input text-center font-mono text-2xl tracking-[0.4em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full py-2.5 uppercase tracking-[0.15em]" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
      </form>
      <form action={logout}><button className="flex min-h-11 w-full items-center justify-center text-sm text-slate-500 underline underline-offset-2">Use a different login</button></form>
    </AuthCard>
  );
}
