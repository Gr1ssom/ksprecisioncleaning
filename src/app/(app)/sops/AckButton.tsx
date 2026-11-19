"use client";
import { useTransition } from "react";
import { ackSop } from "@/app/actions/field";
export function AckButton({ id }: { id: string }) {
  const [p, start] = useTransition();
  return <button disabled={p} onClick={() => start(() => ackSop(id))} className="btn-primary text-xs">I&apos;ve read this</button>;
}
