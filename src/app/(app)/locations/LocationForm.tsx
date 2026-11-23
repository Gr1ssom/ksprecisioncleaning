import { saveLocation } from "@/app/actions/manage";
import { GeoFields } from "@/components/GeoFields";

type Loc = { id: string; name: string; address: string; latitude: number | null; longitude: number | null; geofenceM: number; accessNotes: string | null; clientId: string | null; active: boolean };
export function LocationForm({ loc, clients }: { loc?: Loc; clients: { id: string; name: string }[] }) {
  return (
    <form action={saveLocation} className="space-y-3">
      {loc && <input type="hidden" name="id" value={loc.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Name</label><input name="name" className="input" defaultValue={loc?.name} required /></div>
        <div><label className="label">Client</label>
          <select name="clientId" className="input" defaultValue={loc?.clientId ?? ""}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
      </div>
      <GeoFields address={loc?.address} latitude={loc?.latitude} longitude={loc?.longitude} geofenceM={loc?.geofenceM} />
      <div className="sm:w-1/2"><label className="label">Status</label>
        <select name="active" className="input" defaultValue={loc?.active === false ? "off" : "on"}><option value="on">Active</option><option value="off">Inactive</option></select>
      </div>
      <p className="text-xs text-slate-500">Prices are set per client and service type on the Clients page.</p>
      <div><label className="label">Access notes (key box, alarm, parking)</label><textarea name="accessNotes" rows={2} className="input" defaultValue={loc?.accessNotes ?? ""} /></div>
      <button className="btn-primary">Save</button>
    </form>
  );
}
