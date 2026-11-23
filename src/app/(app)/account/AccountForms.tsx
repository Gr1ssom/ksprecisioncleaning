"use client";
import { useActionState, useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmTwoStep, removeTwoStep, setNewPassword, startTwoStep } from "@/app/actions/account";

export function PasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, null);
  return (
    <form action={action} className="space-y-3">
      <div><label className="label" htmlFor="password">New password</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
      <div><label className="label" htmlFor="again">Type it again</label><input className="input" id="again" name="again" type="password" autoComplete="new-password" minLength={8} required /></div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-emerald-700">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
    </form>
  );
}

export function TwoStep({ enabledFactorId }: { enabledFactorId: string | null }) {
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);

  if (enabledFactorId && !setup) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShieldCheck className="h-5 w-5" />2-step sign-in is on.</p>
        <button type="button" disabled={pending} className="btn-secondary text-red-600"
          onClick={() => { if (confirm("Turn off 2-step sign-in? Your login will only need your password.")) start(async () => setMsg(await removeTwoStep(enabledFactorId))); }}>
          Turn off
        </button>
        {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      </div>
    );
  }
  if (!setup) {
    return (
      <div className="space-y-3">
        <button type="button" disabled={pending} className="btn-primary"
          onClick={() => start(async () => { const r = await startTwoStep(); if (r.error) setMsg({ error: r.error }); else setSetup({ factorId: r.factorId!, qr: r.qr!, secret: r.secret! }); })}>
          <ShieldCheck className="h-4 w-4" />{pending ? "Starting…" : "Turn on 2-step sign-in"}
        </button>
        {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
        {msg?.ok && <p className="text-sm font-semibold text-emerald-700">{msg.ok}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy).</li>
        <li>Scan this code, or type the key under it.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="w-fit rounded-lg bg-white p-2"><img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44" /></div>
      <p className="break-all font-mono text-xs text-slate-500 select-all">{setup.secret}</p>
      <div className="flex gap-2">
        <input className="input max-w-40 text-center font-mono text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label="Code from your app" />
        <button type="button" disabled={pending || code.replace(/\s/g, "").length < 6} className="btn-primary"
          onClick={() => start(async () => { const r = await confirmTwoStep(setup.factorId, code); setMsg(r); if (r?.ok) setSetup(null); })}>
          {pending ? "Checking…" : "Confirm"}
        </button>
      </div>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
    </div>
  );
}
