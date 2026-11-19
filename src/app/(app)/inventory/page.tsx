import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader, Stat } from "@/components/ui";
import { adjustStock, saveDepot, saveSupply } from "@/app/actions/manage";
import { fmtDateTime, money } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Inventory() {
  await requireUser("MANAGER");
  const [supplies, depots, moves, usage] = await Promise.all([
    db.supply.findMany({ include: { stock: true }, orderBy: { name: "asc" } }),
    db.supplyDepot.findMany({ orderBy: { name: "asc" } }),
    db.stockMovement.findMany({ include: { supply: true, depot: true, user: true }, orderBy: { at: "desc" }, take: 20 }),
    db.stockMovement.groupBy({ by: ["supplyId"], where: { reason: "PICKUP", at: { gte: new Date(Date.now() - 30 * 86400_000) } }, _sum: { delta: true } }),
  ]);
  const qty = (s: (typeof supplies)[number], d: string) => s.stock.find((x) => x.depotId === d)?.quantity ?? 0;
  const value = supplies.reduce((sum, s) => sum + s.stock.reduce((a, x) => a + x.quantity, 0) * Number(s.unitCost), 0);
  const lowCount = supplies.reduce((n, s) => n + depots.filter((d) => qty(s, d.id) <= s.reorderAt).length, 0);
  const used = (id: string) => -(usage.find((u) => u.supplyId === id)?._sum.delta ?? 0);
  const spend30 = supplies.reduce((sum, s) => sum + used(s.id) * Number(s.unitCost), 0);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock by pickup location. Staff pickups deduct automatically." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={supplies.length} />
        <Stat label="Stock value" value={money(value)} />
        <Stat label="Low / reorder" value={lowCount} tone={lowCount ? "red" : "slate"} />
        <Stat label="Used last 30 days" value={money(spend30)} />
      </div>
      <div className="card mb-6 overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Supply</th>{depots.map((d) => <th key={d.id} className="text-center">{d.name}</th>)}<th className="text-right">Used 30d</th><th>Adjust</th></tr></thead>
          <tbody>
            {supplies.map((s) => (
              <tr key={s.id}>
                <td><div className="font-medium">{s.name}</div><div className="text-xs text-slate-500">{s.sku} · {money(s.unitCost)}/{s.unit} · reorder at {s.reorderAt}</div></td>
                {depots.map((d) => {
                  const q = qty(s, d.id);
                  return <td key={d.id} className={`text-center text-base font-semibold tabular-nums ${q <= 0 ? "text-red-600" : q <= s.reorderAt ? "text-amber-600" : ""}`}>{q}</td>;
                })}
                <td className="text-right tabular-nums">{used(s.id)}</td>
                <td>
                  <form action={adjustStock} className="flex items-center gap-1">
                    <input type="hidden" name="supplyId" value={s.id} />
                    <select name="depotId" className="input w-32 px-2 py-1 text-xs">{depots.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                    <input name="delta" type="number" className="input w-16 px-2 py-1 text-xs" placeholder="+/-" />
                    <select name="reason" className="input w-24 px-2 py-1 text-xs"><option value="RESTOCK">Restock</option><option value="ADJUST">Count fix</option><option value="TRANSFER">Transfer</option></select>
                    <button className="btn-secondary px-2 py-1 text-xs">Apply</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h2 className="h2 mb-2">Recent movements</h2>
          <div className="card divide-y divide-slate-100 p-0 text-sm">
            {moves.map((m) => (
              <div key={m.id} className="flex justify-between gap-2 p-3">
                <span>{m.supply.name} <span className="text-slate-500">· {m.depot.name} · {m.user?.name ?? "system"} · {fmtDateTime(m.at)}</span></span>
                <span className={`font-semibold tabular-nums ${m.delta < 0 ? "text-red-600" : "text-emerald-600"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
              </div>
            ))}
            {moves.length === 0 && <div className="p-3 text-slate-500">No movements yet.</div>}
          </div>
        </section>
        <section className="space-y-3">
          <details className="card">
            <summary className="cursor-pointer font-semibold text-brand-600">＋ New supply item</summary>
            <form action={saveSupply} className="mt-3 grid grid-cols-2 gap-2">
              <input name="name" placeholder="Name" className="input col-span-2" required />
              <input name="sku" placeholder="SKU" className="input" />
              <input name="unit" placeholder="Unit (case, gallon…)" className="input" />
              <input name="unitCost" type="number" step="0.01" placeholder="Unit cost" className="input" />
              <input name="reorderAt" type="number" placeholder="Reorder at" className="input" />
              <button className="btn-primary col-span-2">Add</button>
            </form>
          </details>
          <details className="card">
            <summary className="cursor-pointer font-semibold text-brand-600">＋ New pickup location</summary>
            <form action={saveDepot} className="mt-3 grid grid-cols-2 gap-2">
              <input name="name" placeholder="Name" className="input col-span-2" required />
              <input name="address" placeholder="Address" className="input col-span-2" required />
              <input name="latitude" type="number" step="any" placeholder="Latitude" className="input" />
              <input name="longitude" type="number" step="any" placeholder="Longitude" className="input" />
              <button className="btn-primary col-span-2">Add</button>
            </form>
          </details>
        </section>
      </div>
    </>
  );
}
