"use client";
import { X } from "lucide-react";
import { useTransition } from "react";
import { deleteRoomTypeTask } from "@/app/actions/manage";
export function DeleteTask({ id }: { id: string }) {
  const [p, start] = useTransition();
  return <button disabled={p} onClick={() => start(() => deleteRoomTypeTask(id))} className="-my-2 flex h-10 w-10 shrink-0 items-center justify-center text-slate-400 hover:text-red-600" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>;
}
