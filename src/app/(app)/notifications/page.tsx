import Link from "next/link";
import { admin, must } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { PushToggle } from "@/components/PushToggle";
import { markAllRead } from "@/app/actions/alerts";
import { pushKeys } from "@/lib/notify";
import { fmtDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const me = await requireUser();
  const [list, keys] = await Promise.all([
    admin().from("Notification").select("*").eq("userId", me.id).order("createdAt", { ascending: false }).limit(60).then((r) => must(r, "alerts") as Notification[]),
    pushKeys(),
  ]);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Alerts" subtitle={unread ? `${unread} new` : "You're all caught up."}
        action={unread > 0 && <form action={markAllRead}><button className="btn-secondary">Mark all read</button></form>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section>
          {list.length === 0 ? <Empty>No alerts yet.</Empty> : (
            <div className="card divide-y divide-slate-100 p-0">
              {list.map((n) => {
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className={n.readAt ? "" : "font-semibold"}>{!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" aria-label="new" />}{n.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(n.createdAt)}</span>
                    </div>
                    {n.body && <div className="mt-0.5 text-sm text-slate-600">{n.body}</div>}
                  </>
                );
                return n.url
                  ? <Link key={n.id} href={n.url} className="block min-h-12 p-3 text-sm hover:bg-slate-50">{body}</Link>
                  : <div key={n.id} className="p-3 text-sm">{body}</div>;
              })}
            </div>
          )}
        </section>
        <aside><PushToggle publicKey={keys.publicKey} /></aside>
      </div>
    </>
  );
}
