/** Great-circle distance in meters. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fenceCheck(
  point: { lat?: number | null; lng?: number | null; acc?: number | null },
  target: { latitude: number | null; longitude: number | null; geofenceM: number },
) {
  if (point.lat == null || point.lng == null || target.latitude == null || target.longitude == null) {
    return { distanceM: null, withinFence: null };
  }
  const d = distanceM(point.lat, point.lng, target.latitude, target.longitude);
  // Give the benefit of GPS accuracy (capped) before flagging.
  const slack = Math.min(point.acc ?? 0, 100);
  return { distanceM: Math.round(d), withinFence: d - slack <= target.geofenceM };
}
