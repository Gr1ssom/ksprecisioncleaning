"use client";
import { useActionState, useEffect } from "react";
import { login } from "../actions/auth";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  // Forget pages saved for offline use, so the next person on this phone can't open them.
  useEffect(() => { navigator.serviceWorker?.controller?.postMessage("clear-pages"); }, []);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <form action={action} className="w-full max-w-md space-y-5 border border-slate-200 bg-surface px-8 pb-8 pt-10 shadow-sm">
        <div className="text-slate-900">
          <Logo className="w-full" />
        </div>
        <div className="flex items-center gap-3 pt-2"><span className="rule" /><span className="eyebrow">Team sign in</span><span className="rule" /></div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <a href="/forgot" className="-mt-2 flex min-h-11 items-center justify-end text-sm text-slate-500 underline underline-offset-2">Forgot password?</a>
        <button className="btn-primary w-full py-2.5 uppercase tracking-[0.15em]" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        {process.env.NODE_ENV !== "production" && (
          <p className="text-center text-xs text-slate-400">Demo: owner@ks.test · manager@ks.test · staff@ks.test — password123</p>
        )}
      </form>
    </main>
  );
}
