"use client";
import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { createFirstOwner } from "./actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(createFirstOwner, null);
  return (
    <main className="pt-safe flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <form action={action} className="w-full max-w-md space-y-4 border border-slate-200 bg-surface px-8 pb-8 pt-10 shadow-sm">
        <div className="text-slate-900"><Logo className="w-full" /></div>
        <div className="flex items-center gap-3 pt-2"><span className="rule" /><span className="eyebrow">Set up the owner</span><span className="rule" /></div>
        <p className="text-sm text-slate-600">No one has signed up yet. Create the owner login. You&apos;ll add managers and staff from the Team page.</p>
        <div><label className="label" htmlFor="name">Your name</label><input className="input" id="name" name="name" autoComplete="name" required /></div>
        <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
        <div><label className="label" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full py-2.5 uppercase tracking-[0.15em]" disabled={pending}>{pending ? "Creating…" : "Create owner"}</button>
      </form>
    </main>
  );
}
