// Browser side of offline mode. Field actions (ticks, room timers, check-in/out, shift clock,
// breaks) go through fieldOp(): sent straight away when there's signal, otherwise kept on the
// phone (localStorage) with the time they happened and sent in order when signal returns.
// Each action has an id, so a retry is never applied twice (the server records applied ids).
import type { FieldOp } from "./fieldOps";

type Item = { id: string; at: number; body: FieldOp; tries: number; uid: string };
type Failed = { id: string; message: string };
const KEY = "ks-field-queue";
const FAILED = "ks-field-failed";

const read = <T,>(k: string): T[] => { try { return JSON.parse(localStorage.getItem(k) ?? "[]") as T[]; } catch { return []; } };
const write = (k: string, v: unknown[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } emit(); };

// Actions belong to whoever was signed in; on a shared phone each person's wait for them.
let uid = "";
const mine = () => read<Item>(KEY).filter((i) => i.uid === uid);

const listeners = new Set<() => void>();
let snap = { waiting: 0, failed: [] as Failed[] };
function emit() {
  snap = { waiting: mine().length, failed: read<Failed>(FAILED) };
  listeners.forEach((l) => l());
}
export const syncStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  get: () => snap,
  server: () => ({ waiting: 0, failed: [] as Failed[] }),
};
export const dismissFailed = () => write(FAILED, []);

class Offline extends Error {}
async function send(item: Item): Promise<{ ok: true } | { error: string; retry?: boolean }> {
  let res: Response;
  try {
    res = await fetch("/api/field", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, at: item.at, uid: item.uid, ...item.body }) });
  } catch {
    throw new Offline();
  }
  // A redirect (e.g. to the sign-in or 2-step page) means it wasn't applied.
  if (res.ok && !res.redirected && res.headers.get("content-type")?.includes("json")) return { ok: true };
  if (res.redirected) return { error: "You need to sign in again; your saved actions will send after that.", retry: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) return { error: "You were signed out. Sign in again; your saved actions will send after that.", retry: true };
  return { error: data.error ?? "The server couldn't save this.", retry: res.status >= 500 };
}

let flushing: Promise<void> | null = null;
/** Send everything waiting, oldest first. Stops at the first network failure. */
export function flush() {
  flushing ??= (async () => {
    try {
      for (;;) {
        const [item] = mine();
        if (!item) break;
        let r;
        try { r = await send(item); } catch { break; }
        const rest = read<Item>(KEY).filter((x) => x.id !== item.id);
        if ("error" in r && r.retry && item.tries < 5) { write(KEY, [{ ...item, tries: item.tries + 1 }, ...rest]); break; }
        if ("error" in r) write(FAILED, [...read<Failed>(FAILED), { id: item.id, message: `${describe(item.body)}: ${r.error}` }]);
        write(KEY, rest);
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Run a field action now, or keep it for later if the phone is offline. */
export async function fieldOp(body: FieldOp): Promise<{ ok: true } | { queued: true } | { error: string }> {
  const item: Item = { id: crypto.randomUUID(), at: Date.now(), body, tries: 0, uid };
  // Keep order: if anything is already waiting, this waits behind it.
  if (!navigator.onLine || mine().length) {
    write(KEY, [...read<Item>(KEY), item]);
    void flush();
    return { queued: true };
  }
  try {
    const r = await send(item);
    return "error" in r ? { error: r.error } : { ok: true };
  } catch {
    write(KEY, [...read<Item>(KEY), item]);
    return { queued: true };
  }
}

/** Start the background sender (once per page load) for the signed-in person. */
let started = false;
export function startSync(userId: string) {
  uid = userId;
  emit();
  if (started || typeof window === "undefined") return;
  started = true;
  emit();
  window.addEventListener("online", () => void flush());
  window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === FAILED) emit(); });
  setInterval(() => { if (mine().length && navigator.onLine) void flush(); }, 20_000);
  if (navigator.onLine) void flush();
}

function describe(b: FieldOp) {
  switch (b.op) {
    case "checkIn": return "Check-in";
    case "checkOut": return "Check-out";
    case "startRoom": return "Room timer start";
    case "stopRoom": return "Room timer stop";
    case "setRoomTask": return `Task "${b.label}"`;
    case "finishRoom": return "Finish room";
    case "setTask": return "Checklist item";
    case "clock": return b.on ? "Start of day" : "End of day";
    case "break": return b.on ? "Break start" : "Break end";
  }
}

/** Is a check-in for this job saved on the phone, waiting to send? (Lets work start offline.) */
export const queuedCheckIn = (assignmentId: string) =>
  typeof window !== "undefined" && mine().some((i) => i.body.op === "checkIn" && i.body.assignmentId === assignmentId);
