"use client";
import { useState, useTransition } from "react";
import { KeyRound, Power, Trash2 } from "lucide-react";
import { removeUser, resetPassword, setUserActive } from "@/app/actions/manage";

export function EmployeeActions({ id, name, active, isSelf }: { id: string; name: string; active: boolean; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string; tempPassword?: string } | null>(null);
  const run = (fn: () => Promise<{ error?: string; ok?: string; tempPassword?: string } | undefined | void>) => start(async () => setMsg((await fn()) ?? null));
  if (isSelf) return <p className="text-sm text-slate-500">This is you. Another manager or the owner manages your login.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => resetPassword(id))}><KeyRound className="h-4 w-4" />Reset password</button>
        <button type="button" disabled={pending} className="btn-secondary" onClick={() => run(() => setUserActive(id, !active))}>
          <Power className="h-4 w-4" />{active ? "Turn off login" : "Turn login back on"}
        </button>
        <button type="button" disabled={pending} className="btn-secondary text-red-600"
          onClick={() => { if (confirm(`Remove ${name}? If they have work history, their login is turned off instead so hours and jobs are kept.`)) run(() => removeUser(id)); }}>
          <Trash2 className="h-4 w-4" />Remove
        </button>
      </div>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      {msg?.tempPassword && (
        <div className="rounded-lg border border-slate-300 p-3">
          <div className="eyebrow">Temporary password</div>
          <div className="mt-1 select-all font-mono text-lg font-semibold">{msg.tempPassword}</div>
          <p className="mt-1 text-xs text-slate-500">Shown once. Tell them in person or by text; they can change it later.</p>
        </div>
      )}
    </div>
  );
}
