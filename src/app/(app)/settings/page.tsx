import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { addRoomTypeTask, saveRules, saveServiceType, updateRoomTypeTask } from "@/app/actions/manage";
import { getRules, getSetting } from "@/lib/settings";
import { headers } from "next/headers";
import type { RoomTypeTask, ServiceType } from "@/lib/types";
import { DeleteTask } from "./DeleteTask";

export const dynamic = "force-dynamic";

function ServicePicker({ services, selected, name = "serviceTypeIds" }: { services: ServiceType[]; selected: string[]; name?: string }) {
  return (
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Applies to</legend>
      {services.map((t) => (
        <label key={t.id} className="chip cursor-pointer border border-slate-300 has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
          <input type="checkbox" name={name} value={t.id} defaultChecked={selected.includes(t.id)} className="sr-only" />{t.name}
        </label>
      ))}
    </fieldset>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireUser("MANAGER");
  const sp = await searchParams;
  const owner = me.role === "OWNER";
  const [rules, appUrl, h] = await Promise.all([getRules(), getSetting<string>("appUrl"), headers()]);
  const here = `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const sb = admin();
  const [tr, rr, sr, ar] = await Promise.all([
    sb.from("RoomTypeTask").select("*").order("roomType").order("sortOrder"),
    sb.from("Room").select("type"),
    sb.from("ServiceType").select("*").order("sortOrder").order("name"),
    sb.from("Assignment").select("serviceTypeId"),
  ]);
  const tasks = must(tr, "room tasks") as RoomTypeTask[];
  const roomTypes = must(rr, "rooms") as { type: string }[];
  const services = must(sr, "services") as ServiceType[];
  const jobs = must(ar, "jobs") as { serviceTypeId: string | null }[];
  const types = [...new Set(tasks.map((t) => t.roomType))];
  const active = services.filter((t) => t.active);
  const svcName = (id: string) => services.find((t) => t.id === id)?.name ?? "?";

  return (
    <>
      <PageHeader title="Settings" />
      {sp.error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{sp.error}</div>}
      {sp.saved === "rules" && <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Pay and alert rules saved.</div>}
      <section className="mb-8">
        <h2 className="h2">Pay and alerts</h2>
        <p className="muted mb-3">How paid hours are counted and who hears about late check-ins.{!owner && " Only the owner can change these."}</p>
        <form action={saveRules} className="card max-w-2xl space-y-4">
          <fieldset disabled={!owner} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="paidDriveTime">Drive time and supply runs</label>
              <select id="paidDriveTime" name="paidDriveTime" defaultValue={rules.paidDriveTime ? "yes" : "no"} className="input">
                <option value="yes">Paid (whole day on the clock)</option><option value="no">Not paid (only time at jobs)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="paidBreaks">Breaks</label>
              <select id="paidBreaks" name="paidBreaks" defaultValue={rules.paidBreaks ? "yes" : "no"} className="input">
                <option value="no">Unpaid</option><option value="yes">Paid</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="breakAfterHours">Remind to take a break after (hours, 0 = off)</label>
              <input id="breakAfterHours" name="breakAfterHours" type="number" min="0" max="12" step="0.5" inputMode="decimal" defaultValue={rules.breakAfterHours} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="overtimeHours">Overtime warning after (hours per week)</label>
              <input id="overtimeHours" name="overtimeHours" type="number" min="1" max="80" step="1" inputMode="numeric" defaultValue={rules.overtimeHours} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="lateMinutes">&quot;Not checked in&quot; alert after (minutes)</label>
              <input id="lateMinutes" name="lateMinutes" type="number" min="5" max="120" step="5" inputMode="numeric" defaultValue={rules.lateMinutes} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="lateAlertTo">Who gets that alert</label>
              <select id="lateAlertTo" name="lateAlertTo" defaultValue={rules.lateAlertTo} className="input">
                <option value="both">Managers and owners</option><option value="managers">Managers</option><option value="owners">Owners</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mileageRate">Mileage pay ($ per mile, 0 = miles only)</label>
              <input id="mileageRate" name="mileageRate" type="number" min="0" max="5" step="0.01" inputMode="decimal" defaultValue={rules.mileageRate} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="appUrl">App address (turns on reminders and late alerts)</label>
              <input id="appUrl" name="appUrl" type="url" placeholder={here} defaultValue={appUrl ?? ""} className="input" />
              {!appUrl && <p className="mt-1 text-xs text-slate-500">Use the live address, e.g. {here}. Leave empty on test copies.</p>}
            </div>
          </fieldset>
          <p className="text-xs text-slate-500">Overtime is always paid at 1.5× after 40 hours in a Mon–Sun week; the warning number only changes when you&apos;re warned.</p>
          {owner && <button className="btn-primary">Save</button>}
        </form>
      </section>
      <section className="mb-8">
        <h2 className="h2">Service types</h2>
        <p className="muted mb-3">The kinds of visit you sell. Each client gets its own price per service type on the Clients page.</p>
        <div className="card max-w-2xl divide-y divide-slate-100 p-0">
          {services.map((t) => (
            <form key={t.id} action={saveServiceType} className="flex flex-wrap items-center gap-2 p-3">
              <input type="hidden" name="id" value={t.id} />
              <input name="name" defaultValue={t.name} className="input min-w-40 flex-1" required />
              <select name="active" defaultValue={t.active ? "on" : "off"} className="input w-32"><option value="on">Offered</option><option value="off">Retired</option></select>
              <span className="w-16 text-right text-xs text-slate-500">{jobs.filter((j) => j.serviceTypeId === t.id).length} jobs</span>
              <button className="btn-secondary">Save</button>
            </form>
          ))}
          <form action={saveServiceType} className="flex gap-2 p-3">
            <input name="name" className="input flex-1" placeholder="New service, e.g. Move-out clean" required />
            <button className="btn-primary">Add</button>
          </form>
        </div>
      </section>

      <h2 className="h2">Room tasks</h2>
      <p className="muted mb-3">
        Common checklists by room type. Every room of that type on a floor plan gets these, plus its own tasks.
        Limit a task to certain services (e.g. &ldquo;Inside oven&rdquo; only on a Deep clean) and add minutes to estimate how long a room takes.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => {
          const list = tasks.filter((t) => t.roomType === type);
          const est = list.filter((t) => !t.serviceTypeIds.length).reduce((s, t) => s + (t.minutes ?? 0), 0);
          return (
            <div key={type} className="card">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-serif text-xl font-black">{type}</h3>
                <span className="text-xs text-slate-500">{roomTypes.filter((r) => r.type === type).length} rooms{est ? ` · ~${est} min` : ""}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {list.map((t) => (
                  <li key={t.id} className="flex items-start gap-1">
                    <details className="flex-1 py-1">
                      <summary className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span>{t.label}</span>
                        {t.minutes ? <span className="text-xs text-slate-500">{t.minutes} min</span> : null}
                        {t.serviceTypeIds.map((id) => <span key={id} className="badge bg-slate-100 text-slate-700">{svcName(id)} only</span>)}
                      </summary>
                      <form action={updateRoomTypeTask} className="mt-2 space-y-2 pb-2">
                        <input type="hidden" name="id" value={t.id} />
                        <div className="flex gap-2">
                          <input name="label" defaultValue={t.label} className="input flex-1" required />
                          <input name="minutes" type="number" min="0" defaultValue={t.minutes ?? ""} placeholder="min" className="input w-20" />
                        </div>
                        <div className="eyebrow">Only on (none = every visit)</div>
                        <ServicePicker services={active} selected={t.serviceTypeIds} />
                        <button className="btn-secondary">Save</button>
                      </form>
                    </details>
                    <DeleteTask id={t.id} />
                  </li>
                ))}
              </ul>
              <details className="mt-2">
                <summary className="text-sm font-semibold">Add tasks</summary>
                <form action={addRoomTypeTask} className="mt-2 space-y-2">
                  <input type="hidden" name="roomType" value={type} />
                  <textarea name="labels" rows={3} className="input" placeholder="One per line" required />
                  <div className="flex items-center gap-2"><input name="minutes" type="number" min="0" className="input w-24" placeholder="min each" /></div>
                  <div className="eyebrow">Only on (none = every visit)</div>
                  <ServicePicker services={active} selected={[]} />
                  <button className="btn-primary">Add</button>
                </form>
              </details>
            </div>
          );
        })}
        <div className="card">
          <h3 className="mb-2 font-serif text-xl font-black">New room type</h3>
          <form action={addRoomTypeTask} className="space-y-2">
            <input name="roomType" className="input" placeholder="e.g. Laundry, Gym, Conference" required />
            <textarea name="labels" rows={4} className="input" placeholder="Tasks, one per line" required />
            <input name="minutes" type="number" min="0" className="input w-28" placeholder="min each" />
            <button className="btn-primary">Create</button>
          </form>
        </div>
      </div>
    </>
  );
}
