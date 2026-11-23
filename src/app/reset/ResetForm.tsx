"use client";
import { useActionState } from "react";
import { setNewPassword } from "../actions/account";

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="from" value="reset" />
      <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
      <div><label className="label" htmlFor="again">Type it again</label><input className="input" id="again" name="again" type="password" autoComplete="new-password" minLength={8} required /></div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-2.5 uppercase tracking-[0.15em]" disabled={pending}>{pending ? "Saving…" : "Save password"}</button>
    </form>
  );
}
