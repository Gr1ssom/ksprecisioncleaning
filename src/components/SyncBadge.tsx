"use client";
import { useEffect, useSyncExternalStore } from "react";
import { CloudOff, TriangleAlert, X } from "lucide-react";
import { dismissFailed, flush, startSync, syncStore } from "@/lib/offline";

/** "Waiting to sync" pill while the phone holds actions it couldn't send yet, and any that failed. */
export function SyncBadge({ userId }: { userId: string }) {
  useEffect(() => startSync(userId), [userId]);
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get, syncStore.server);
  if (!s.waiting && !s.failed.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-center gap-2 px-4 md:bottom-4 md:left-60">
      {s.waiting > 0 && (
        <button onClick={() => void flush()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-100 px-4 text-sm font-semibold text-amber-900 shadow">
          <CloudOff className="h-4 w-4" />{s.waiting} waiting to sync
        </button>
      )}
      {s.failed.length > 0 && (
        <div className="w-full max-w-md rounded-xl bg-red-50 p-3 text-sm text-red-800 shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><div>
              <div className="font-semibold">Some saved actions couldn&apos;t be applied</div>
              <ul className="mt-1 list-disc pl-4">{s.failed.map((f) => <li key={f.id}>{f.message}</li>)}</ul>
              <div className="mt-1">Tell your manager so they can fix your hours.</div>
            </div></div>
            <button onClick={dismissFailed} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
