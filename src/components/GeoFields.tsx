"use client";
import { useRef, useState, useTransition } from "react";
import { LocateFixed, Search } from "lucide-react";
import { lookupAddress } from "@/app/actions/geocode";

/**
 * Address + geofence fields. Coordinates come from the address (lookup) or from the manager's
 * phone while standing on site; typing them stays possible.
 */
export function GeoFields({ address, latitude, longitude, geofenceM }: { address?: string; latitude?: number | null; longitude?: number | null; geofenceM?: number }) {
  const addr = useRef<HTMLInputElement>(null);
  const [lat, setLat] = useState(latitude != null ? String(latitude) : "");
  const [lng, setLng] = useState(longitude != null ? String(longitude) : "");
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);

  const find = () => start(async () => {
    const r = await lookupAddress(addr.current?.value ?? "");
    if (r.error) return setMsg({ error: r.error });
    setLat(String(r.lat)); setLng(String(r.lng));
    setMsg({ ok: `Found: ${r.matched}` });
  });
  const here = () => {
    if (!("geolocation" in navigator)) return setMsg({ error: "This phone can't share its location." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocating(false); setMsg({ ok: `Set from your phone (±${Math.round(p.coords.accuracy)} m). Stand near the main entrance for the best fence.` }); },
      () => { setLocating(false); setMsg({ error: "Couldn't get your location. Allow location for this app, then try again." }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-3">
      <div><label className="label" htmlFor="address">Address</label><input ref={addr} id="address" name="address" className="input" defaultValue={address} required autoComplete="street-address" /></div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={find} disabled={pending} className="btn-secondary"><Search className="h-4 w-4" />{pending ? "Looking up…" : "Find from address"}</button>
        <button type="button" onClick={here} disabled={locating} className="btn-secondary"><LocateFixed className="h-4 w-4" />{locating ? "Getting location…" : "Use my location"}</button>
      </div>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label" htmlFor="latitude">Latitude</label><input id="latitude" name="latitude" type="number" step="any" inputMode="decimal" className="input" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
        <div><label className="label" htmlFor="longitude">Longitude</label><input id="longitude" name="longitude" type="number" step="any" inputMode="decimal" className="input" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
        <div><label className="label" htmlFor="geofenceM">Fence (m)</label><input id="geofenceM" name="geofenceM" type="number" inputMode="numeric" className="input" defaultValue={geofenceM ?? 150} /></div>
      </div>
      {lat && lng ? (
        <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">Check the pin on Google Maps</a>
      ) : (
        <p className="text-xs text-amber-700">No coordinates yet: check-ins here can&apos;t be verified until you set them.</p>
      )}
    </div>
  );
}
