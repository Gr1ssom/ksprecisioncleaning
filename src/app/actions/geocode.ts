"use server";
import { requireUser } from "@/lib/auth";
import { geocode, type GeoResult } from "@/lib/geocode";

/** Address → coordinates for the location form's "Find from address" button. */
export async function lookupAddress(address: string): Promise<GeoResult> {
  await requireUser("MANAGER");
  return geocode(address);
}
