"use client";
import { useActionState } from "react";
import { login } from "../actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl bg-surface p-8 shadow-xl">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-xl font-bold">KS Precision Cleaning</h1>
          <p className="muted">Sign in to your account</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        {process.env.NODE_ENV !== "production" && (
          <p className="text-center text-xs text-slate-400">Demo: owner@ks.test · manager@ks.test · staff@ks.test — password123</p>
        )}
      </form>
    </main>
  );
}
