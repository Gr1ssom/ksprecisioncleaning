"use client";
import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";
import { removePush, savePush, testPush } from "@/app/actions/alerts";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Turn phone notifications on or off for this device. iPhone only allows them once the app is
 * added to the Home Screen (Share → Add to Home Screen) and opened from there.
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = () => start(async () => {
    setMsg(null);
    if ((await Notification.requestPermission()) !== "granted") { setState("denied"); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    const r = await savePush(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, navigator.userAgent);
    if ("error" in r && r.error) { setMsg(r.error); return; }
    setState("on");
    await testPush();
  });
  const turnOff = () => start(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await removePush(sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  });

  return (
    <div className="card">
      <div className="font-semibold">Phone notifications</div>
      {state === "loading" && <p className="muted mt-1">Checking this phone…</p>}
      {state === "unsupported" && <p className="muted mt-1">This browser can&apos;t show notifications. Alerts still appear here in the app.</p>}
      {state === "ios-install" && <p className="muted mt-1">On iPhone, first add the app to your Home Screen (Share → Add to Home Screen), open it from there, then turn notifications on here.</p>}
      {state === "denied" && <p className="muted mt-1">Notifications are blocked for this app. Allow them in your phone&apos;s settings, then come back here.</p>}
      {(state === "off" || state === "on") && (
        <>
          <p className="muted mt-1">{state === "on" ? "On for this phone: new jobs, reminders before a job, shift and time-off decisions." : "Get new jobs, reminders before a job, and decisions on your requests."}</p>
          <button type="button" disabled={pending} onClick={state === "on" ? turnOff : turnOn} className={`mt-3 ${state === "on" ? "btn-secondary" : "btn-primary"}`}>
            {state === "on" ? <><BellOff className="h-4 w-4" />Turn off</> : <><BellRing className="h-4 w-4" />Turn on</>}
          </button>
        </>
      )}
      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </div>
  );
}
