"use server";
import { requireUser } from "@/lib/auth";

export type GeoResult = { lat?: number; lng?: number; matched?: string; error?: string };

/**
 * Address → coordinates with the US Census Bureau geocoder (free, no key, US addresses).
 * https://geocoding.geo.census.gov
 */
export async function lookupAddress(address: string): Promise<GeoResult> {
  await requireUser("MANAGER");
  const q = address.trim();
  if (q.length < 6) return { error: "Type the full street address first." };
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", q);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { error: "The address lookup isn't answering. Use your location on site, or try again later." };
    const json = await res.json();
    const m = json?.result?.addressMatches?.[0];
    if (!m) return { error: "No match for that address. Check the street, city and state, or use your location on site." };
    return { lat: Number(m.coordinates.y.toFixed(6)), lng: Number(m.coordinates.x.toFixed(6)), matched: m.matchedAddress };
  } catch {
    return { error: "The address lookup isn't answering. Use your location on site, or try again later." };
  }
}
