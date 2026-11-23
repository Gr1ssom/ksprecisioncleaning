import { admin, must } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { saveUser } from "@/app/actions/manage";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

type U = { id: string; name: string; email: string; phone: string | null; role: string; hourlyRate: unknown; waveEmployeeId: string | null; active: boolean };
function UserForm({ u, owner }: { u?: U; owner: boolean }) {
  return (
    <form action={saveUser} className="mt-3 grid gap-2 sm:grid-cols-2">
      {u && <input type="hidden" name="id" value={u.id} />}
      <input name="name" defaultValue={u?.name} placeholder="Full name" className="input" required />
      <input name="email" type="email" defaultValue={u?.email} placeholder="Email (login)" className="input" required />
      <input name="phone" defaultValue={u?.phone ?? ""} placeholder="Phone" className="input" />
      <input name="password" type="password" placeholder={u ? "New password (leave blank to keep)" : "Starting password"} className="input" required={!u} minLength={8} />
      {owner && (
        <>
          <select name="role" defaultValue={u?.role ?? "STAFF"} className="input"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option><option value="OWNER">Owner</option></select>
          <input name="hourlyRate" type="number" step="0.01" defaultValue={String(u?.hourlyRate ?? "")} placeholder="Hourly rate" className="input" />
          <input name="waveEmployeeId" defaultValue={u?.waveEmployeeId ?? ""} placeholder="Wave Payroll employee ID" className="input" />
          <select name="active" defaultValue={u?.active === false ? "off" : "on"} className="input"><option value="on">Active</option><option value="off">Deactivated (no sign-in)</option></select>
        </>
      )}
      <button className="btn-primary w-fit">Save</button>
    </form>
  );
}

export default async function Team() {
  const me = await requireUser("MANAGER");
  const owner = me.role === "OWNER";
  const users = must(await admin().from("User").select("*").order("active", { ascending: false }).order("role", { ascending: false }).order("name"), "team") as Profile[];
  return (
    <>
      <PageHeader title="Team" subtitle={owner ? "Roles, pay rates and logins" : "Managers can add staff. The owner sets roles and pay."} />
      <div className="space-y-2">
        {users.map((u) => (
          <details key={u.id} className={`card ${u.active ? "" : "opacity-60"}`}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span><span className="font-semibold">{u.name}</span> <span className="text-sm text-slate-500">· {u.email}{u.phone && ` · ${u.phone}`}</span></span>
              <span className="flex items-center gap-2">{owner && <span className="text-sm text-slate-500">{money(u.hourlyRate)}/h</span>}<Badge value={u.role} />{!u.active && <span className="badge bg-slate-100 text-slate-500">deactivated</span>}</span>
            </summary>
            {owner ? <UserForm u={u} owner /> : <p className="mt-2 text-sm text-slate-500">Ask the owner to change this person&apos;s details.</p>}
          </details>
        ))}
        <details className="card"><summary className="cursor-pointer font-semibold text-brand-600">Add team member</summary><UserForm owner={owner} /></details>
      </div>
    </>
  );
}
