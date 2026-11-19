"use client";
import { useRef, useState } from "react";

/**
 * A form that grabs the device's GPS position before submitting, adding lat/lng/acc hidden fields.
 * If location is denied/unavailable the check-in still goes through, flagged as "no GPS".
 */
export function GeoForm({ action, children, submitLabel, className = "btn-primary w-full", encType }: {
  action: (f: FormData) => void | Promise<void>; children?: React.ReactNode; submitLabel: string; className?: string; encType?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "locating" | "sending">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  function submitWith(pos?: GeolocationPosition) {
    const f = ref.current!;
    const set = (n: string, v: string) => { (f.elements.namedItem(n) as HTMLInputElement).value = v; };
    set("lat", pos ? String(pos.coords.latitude) : "");
    set("lng", pos ? String(pos.coords.longitude) : "");
    set("acc", pos ? String(pos.coords.accuracy) : "");
    setState("sending");
    f.requestSubmit();
  }

  function onClick(e: React.MouseEvent) {
    if (state !== "idle") return;
    const f = ref.current!;
    if (!f.reportValidity()) return;
    e.preventDefault();
    if (!("geolocation" in navigator)) return submitWith();
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => submitWith(p),
      () => { setMsg("Location unavailable – checking in without GPS (your manager will see this)."); submitWith(); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <form ref={ref} action={action} encType={encType} className="space-y-3">
      <input type="hidden" name="lat" /><input type="hidden" name="lng" /><input type="hidden" name="acc" />
      {children}
      {msg && <p className="text-xs text-amber-600">{msg}</p>}
      <button type="button" onClick={onClick} disabled={state !== "idle"} className={className}>
        {state === "locating" ? "Getting your location…" : state === "sending" ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
