"use client";
import { useActionState } from "react";
import { saveUser } from "@/app/actions/manage";
import { ROLE_INFO } from "@/lib/team";
import type { Role } from "@/lib/session";

type Emp = { id: string; name: string; email: string; phone: string | null; role: Role; hourlyRate: number; waveEmployeeId: string | null };

export function EmployeeForm({ emp, roles, showPay, lockRole }: { emp?: Emp; roles: Role[]; showPay: boolean; lockRole?: boolean }) {
  const [state, action, pending] = useActionState(saveUser, null);
  return (
    <form action={action} className="space-y-4">
      {emp && <input type="hidden" name="id" value={emp.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" defaultValue={emp?.name} className="input" autoComplete="off" required /></div>
        <div><label className="label" htmlFor="email">Email (their login)</label><input id="email" name="email" type="email" defaultValue={emp?.email} className="input" autoComplete="off" required /></div>
        <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" type="tel" defaultValue={emp?.phone ?? ""} className="input" /></div>
        <div>
          <label className="label" htmlFor="password">{emp ? "New password (optional)" : "Starting password"}</label>
          <input id="password" name="password" type="text" className="input" minLength={8} required={!emp} autoComplete="new-password" placeholder={emp ? "Leave blank to keep" : "8+ characters"} />
          <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="mustChange" defaultChecked className="h-5 w-5" />
            Make them choose their own at first sign-in
          </label>
        </div>
      </div>

      <fieldset>
        <legend className="label">Access level</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(lockRole && emp ? [emp.role] : roles).map((r) => (
            <label key={r} className="flex cursor-pointer gap-3 rounded-lg border border-slate-300 p-3 has-[:checked]:border-ink has-[:checked]:ring-2 has-[:checked]:ring-slate-200">
              <input type="radio" name="role" value={r} defaultChecked={(emp?.role ?? "STAFF") === r} className="mt-0.5" />
              <span><span className="block font-semibold">{ROLE_INFO[r].label}</span><span className="block text-xs text-slate-500">{ROLE_INFO[r].summary}</span></span>
            </label>
          ))}
        </div>
        {lockRole && <p className="mt-1 text-xs text-slate-500">You can&apos;t change your own access level.</p>}
      </fieldset>

      {showPay && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="hourlyRate">Hourly rate ($)</label><input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={emp ? String(emp.hourlyRate) : ""} className="input" /></div>
          <div><label className="label" htmlFor="waveEmployeeId">Wave Payroll employee ID</label><input id="waveEmployeeId" name="waveEmployeeId" defaultValue={emp?.waveEmployeeId ?? ""} className="input" /></div>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-emerald-600">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : emp ? "Save" : "Add employee"}</button>
    </form>
  );
}
