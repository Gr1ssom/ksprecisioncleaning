import Link from "next/link";
import { Check, Minus, Search, UserPlus } from "lucide-react";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { lastSignIns } from "@/lib/authUsers";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ACCESS_MATRIX, ROLE_INFO } from "@/lib/team";
import { fmtDateTime, money } from "@/lib/format";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Team({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; removed?: string }> }) {
  const me = await requireUser("MANAGER");
  const sp = await searchParams;
  const status = sp.status === "off" ? "off" : sp.status === "all" ? "all" : "on";
  const [users, signIns] = await Promise.all([
    admin().from("User").select("*").order("name").then((r) => must(r, "team") as Profile[]),
    lastSignIns(),
  ]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = users
    .filter((u) => (status === "all" ? true : status === "on" ? u.active : !u.active))
    .filter((u) => !sp.role || u.role === sp.role)
    .filter((u) => !q || `${u.name} ${u.email} ${u.phone ?? ""}`.toLowerCase().includes(q));
  const count = (r: string) => users.filter((u) => u.active && u.role === r).length;
  const href = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ q: sp.q, role: sp.role, status, ...o }).filter((e): e is [string, string] => !!e[1])).toString();
  const owner = me.role === "OWNER";

  return (
    <>
      <PageHeader title="Team" subtitle={`${users.filter((u) => u.active).length} active · ${count("OWNER")} owner · ${count("MANAGER")} managers · ${count("STAFF")} staff`}
        action={<Link href="/team/new" className="btn-primary"><UserPlus className="h-4 w-4" />Add employee</Link>} />
      {sp.removed && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Removed.</div>}

      <form className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400 md:top-2.5" />
          <input name="q" defaultValue={sp.q} className="input pl-9" placeholder="Search name, email or phone" />
        </div>
        {sp.role && <input type="hidden" name="role" value={sp.role} />}
        <input type="hidden" name="status" value={status} />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[["", "All roles"], ["OWNER", "Owners"], ["MANAGER", "Managers"], ["STAFF", "Staff"]].map(([v, l]) => (
          <Link key={v} href={href({ role: v || undefined })} className={`chip ${(sp.role ?? "") === v ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>{l}</Link>
        ))}
        <span className="mx-1 w-px bg-slate-200" />
        {[["on", "Active"], ["off", "Turned off"], ["all", "Everyone"]].map(([v, l]) => (
          <Link key={v} href={href({ status: v })} className={`chip ${status === v ? "bg-ink text-paper" : "bg-slate-100 text-slate-700"}`}>{l}</Link>
        ))}
      </div>

      {list.length === 0 ? <Empty>No one matches.</Empty> : (
        <div className="card divide-y divide-slate-100 p-0">
          {list.map((u) => (
            <Link key={u.id} href={`/team/${u.id}`} className={`flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-slate-50 ${u.active ? "" : "opacity-60"}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-serif text-base font-black text-paper">
                {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{u.name}{u.id === me.id && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}</span>
                <span className="block truncate text-xs text-slate-500">{u.email}{u.phone && ` · ${u.phone}`}</span>
                <span className="block text-xs text-slate-400">{signIns[u.id] ? `Last signed in ${fmtDateTime(signIns[u.id]!)}` : "Never signed in"}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge value={u.role} label={ROLE_INFO[u.role].label.toLowerCase()} />
                {!u.active && <span className="badge bg-slate-100 text-slate-500">turned off</span>}
                {owner && u.role !== "OWNER" && <span className="text-xs text-slate-500">{money(u.hourlyRate)}/h</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-8">
        <h2 className="h2 mb-2">Access levels</h2>
        <div className="card overflow-x-auto p-0">
          <table className="tbl">
            <thead><tr><th>What they can do</th><th className="text-center">Staff</th><th className="text-center">Manager</th><th className="text-center">Owner</th></tr></thead>
            <tbody>
              {ACCESS_MATRIX.map((r) => (
                <tr key={r.area}>
                  <td>{r.area}</td>
                  {[r.staff, r.manager, r.owner].map((v, i) => (
                    <td key={i} className="text-center">
                      {v === true ? <Check className="mx-auto h-4 w-4" /> : v === false ? <Minus className="mx-auto h-4 w-4 text-slate-300" /> : <span className="text-xs text-slate-500">{v === "own" ? "their own" : "staff only"}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
