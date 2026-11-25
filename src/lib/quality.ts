// Quality numbers: inspection scores and client ratings. Pure (no server-only), unit-tested.

export type RoomResult = "PASS" | "TOUCH_UP" | "FAIL";
export const RESULTS: RoomResult[] = ["PASS", "TOUCH_UP", "FAIL"];
export const RESULT_LABEL: Record<RoomResult, string> = { PASS: "Pass", TOUCH_UP: "Touch-up", FAIL: "Fail" };

/** Points per room: a pass is full marks, a touch-up most of them, a fail none. */
export const RESULT_POINTS: Record<RoomResult, number> = { PASS: 100, TOUCH_UP: 60, FAIL: 0 };

/** An inspection's score (0–100) from its room results, or null with no rooms scored. */
export function inspectionScore(results: RoomResult[]): number | null {
  if (!results.length) return null;
  return Math.round((results.reduce((s, r) => s + RESULT_POINTS[r], 0) / results.length) * 10) / 10;
}

/** A client's 1–5 rating on the same 0–100 scale (5 = 100, 1 = 0). */
export const ratingPoints = (rating: number) => ((Math.min(5, Math.max(1, rating)) - 1) / 4) * 100;

/** Ratings at or below this alert managers and count as a complaint. */
export const LOW_RATING = 2;
export const isLowRating = (rating: number) => rating <= LOW_RATING;

export type QualityRow = {
  key: string;
  rooms: number; passed: number; touchUps: number; fails: number;
  /** Share of inspected rooms that passed first time (0–1), or null. */
  passRate: number | null;
  /** Average room points from inspections (0–100), or null. */
  inspectionScore: number | null;
  ratings: number;
  /** Average client rating (1–5), or null. */
  avgRating: number | null;
  /**
   * One number to compare by (0–100): every inspected room and every client rating counts once,
   * on the same 0–100 scale. Null when there is nothing to go on.
   */
  score: number | null;
};

/** Roll inspected rooms and client ratings up by a key (a cleaner id or a location id). */
export function qualityByKey(
  rooms: { key: string | null; result: RoomResult }[],
  ratings: { key: string | null; rating: number }[],
): Map<string, QualityRow> {
  const out = new Map<string, QualityRow & { _pts: number; _ratingSum: number; _ratingPts: number }>();
  const row = (key: string) => {
    let r = out.get(key);
    if (!r) {
      r = { key, rooms: 0, passed: 0, touchUps: 0, fails: 0, passRate: null, inspectionScore: null, ratings: 0, avgRating: null, score: null, _pts: 0, _ratingSum: 0, _ratingPts: 0 };
      out.set(key, r);
    }
    return r;
  };
  for (const x of rooms) {
    if (!x.key) continue;
    const r = row(x.key);
    r.rooms++; r._pts += RESULT_POINTS[x.result];
    if (x.result === "PASS") r.passed++; else if (x.result === "TOUCH_UP") r.touchUps++; else r.fails++;
  }
  for (const x of ratings) {
    if (!x.key) continue;
    const r = row(x.key);
    r.ratings++; r._ratingSum += x.rating; r._ratingPts += ratingPoints(x.rating);
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const done = new Map<string, QualityRow>();
  for (const [k, r] of out) {
    const { _pts, _ratingSum, _ratingPts, ...rest } = r;
    const n = r.rooms + r.ratings;
    done.set(k, {
      ...rest,
      passRate: r.rooms ? r.passed / r.rooms : null,
      inspectionScore: r.rooms ? round1(_pts / r.rooms) : null,
      avgRating: r.ratings ? round1(_ratingSum / r.ratings) : null,
      score: n ? Math.round((_pts + _ratingPts) / n) : null,
    });
  }
  return done;
}
