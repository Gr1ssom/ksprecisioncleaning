import { useSyncExternalStore } from "react";
import { queuedCheckIn, syncStore } from "@/lib/offline";

/** True while a check-in for this job is saved on the phone (no signal yet), so work can start. */
export function useOfflineStart(assignmentId: string, allowed: boolean) {
  return useSyncExternalStore(syncStore.subscribe, () => allowed && queuedCheckIn(assignmentId), () => false);
}
