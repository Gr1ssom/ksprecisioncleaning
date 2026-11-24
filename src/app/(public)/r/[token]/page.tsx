import { notFound } from "next/navigation";
import { Check, Clock, StickyNote, Star } from "lucide-react";
import { loadReport } from "@/lib/clientReports";
import { submitFeedback } from "@/app/actions/public";
import { fmtDate, fmtTime, hoursBetween } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A client's report of one visit. Opened by its secret link; shows that visit and nothing else. */
export default async function VisitReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ thanks?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = await loadReport(token);
  if (!r) notFound();
  const minutes = r.rooms.reduce((s, x) => s + x.minutes, 0);
  const rate = submitFeedback.bind(null, token);
  return (
    <>
      <div className="eyebrow">Visit report</div>
      <h1 className="h1 mt-1">{r.locationName}</h1>
      <p className="muted mt-1">{[fmtDate(r.date), r.service, r.cleaner && `Cleaned by ${r.cleaner}`].filter(Boolean).join(" · ")}</p>
      {r.status !== "COMPLETED" && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This visit isn&apos;t finished yet. The report fills in as the work is done.</div>}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Arrived" value={r.arrived ? fmtTime(r.arrived) : "—"} />
        <Fact label="Left" value={r.left ? fmtTime(r.left) : "—"} />
        <Fact label="On site" value={r.arrived && r.left ? `${hoursBetween(r.arrived, r.left).toFixed(1)} h` : "—"} />
        <Fact label="Rooms" value={String(r.rooms.length)} />
      </div>

      {r.note && (
        <div className="card mt-4 text-sm"><div className="eyebrow mb-1"><StickyNote className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />Note from your cleaner</div>{r.note}</div>
      )}

      {r.rooms.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-3"><h2 className="h2">Rooms</h2><span className="rule" />{minutes > 0 && <span className="text-xs text-slate-500">{minutes} min timed</span>}</div>
          <div className="space-y-3">
            {r.rooms.map((room) => (
              <div key={room.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-serif text-xl font-black">{room.name}</div>
                  <div className="flex gap-3 text-xs text-slate-500">
                    {room.tasks > 0 && <span><Check className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" />{room.tasksDone}/{room.tasks} tasks</span>}
                    {room.minutes > 0 && <span><Clock className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" />{room.minutes} min</span>}
                  </div>
                </div>
                {room.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {room.photos.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noreferrer" className="relative block">
                        <img src={p.url} alt={`${room.name}, ${p.kind}`} className="aspect-square w-full rounded-md object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold uppercase text-white">{p.kind}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {r.checklist.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-3"><h2 className="h2">Also done</h2><span className="rule" /></div>
          <ul className="card divide-y divide-slate-100 py-1 text-sm">
            {r.checklist.map((t, i) => (
              <li key={i} className="flex min-h-10 items-center gap-2">{t.done ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4" />}<span className={t.done ? "" : "text-slate-500"}>{t.label}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section id="rate" className="mt-8">
        <div className="mb-2 flex items-center gap-3"><h2 className="h2">How did we do?</h2><span className="rule" /></div>
        {sp.thanks && <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Thank you! Your rating was sent{r.feedback && r.feedback.rating <= 2 ? ", and a manager will follow up" : ""}.</div>}
        {sp.error && <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Tap a star from 1 to 5 to send your rating.</div>}
        <form action={rate} className="card space-y-3">
          <label className="block">
            <span className="label">Comment (optional)</span>
            <textarea name="comment" rows={2} maxLength={1000} defaultValue={r.feedback?.comment ?? ""} className="input" placeholder="Anything we missed, or did well?" />
          </label>
          <div>
            <div className="mb-1 text-sm text-slate-600">{r.feedback ? `You rated this visit ${r.feedback.rating} out of 5. Tap to change it.` : "Tap a star to send your rating."}</div>
            <div className="flex gap-1" role="group" aria-label="Rating from 1 to 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} name="rating" value={n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-slate-900 hover:bg-slate-100">
                  <Star className={`h-8 w-8 ${r.feedback && n <= r.feedback.rating ? "fill-current" : ""}`} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="card"><div className="eyebrow">{label}</div><div className="mt-1 font-serif text-2xl font-black">{value}</div></div>;
}
