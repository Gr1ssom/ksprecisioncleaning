"use client";
import { useTransition } from "react";
import { deleteRoomTypeTask } from "@/app/actions/manage";
export function DeleteTask({ id }: { id: string }) {
  const [p, start] = useTransition();
  return <button disabled={p} onClick={() => start(() => deleteRoomTypeTask(id))} className="text-xs text-slate-400 hover:text-red-600" aria-label="Remove">✕</button>;
}
