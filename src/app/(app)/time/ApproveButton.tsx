"use client";
import { useTransition } from "react";
import { approveTime } from "@/app/actions/manage";
export function ApproveButton({ ids, shiftIds = [], label, small }: { ids: string[]; shiftIds?: string[]; label: string; small?: boolean }) {
  const [p, start] = useTransition();
  return <button disabled={p} onClick={() => start(() => approveTime(ids, shiftIds))} className={small ? "btn-secondary px-2 py-1 text-xs" : "btn-primary"}>{label}</button>;
}
