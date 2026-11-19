"use client";
import { useTransition } from "react";
import { resolveIssue } from "@/app/actions/manage";
export function ResolveButton({ id }: { id: string }) {
  const [p, start] = useTransition();
  return <button disabled={p} onClick={() => start(() => resolveIssue(id))} className="btn-secondary text-xs">Resolve</button>;
}
