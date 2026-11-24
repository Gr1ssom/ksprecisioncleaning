"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Play } from "lucide-react";
import { fieldOp } from "@/lib/offline";
import { useSynced } from "./useSynced";

/** Start/end a break. Pauses the room timer. Works without signal (saved and sent later). */
export function BreakButton({ onBreak }: { onBreak: boolean }) {
  const [on, setOn] = useSynced(onBreak);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = () => {
    const next = !on;
    setOn(next); // shows at once
    start(async () => {
      const r = await fieldOp({ op: "break", on: next });
      if ("error" in r) { setOn(!next); setMsg(r.error); }
      else setMsg("queued" in r ? "No signal: saved on your phone." : null);
      if (!("queued" in r)) router.refresh();
    });
  };
  return (
    <div>
      <button type="button" onClick={toggle} disabled={pending} className={`${on ? "btn-success" : "btn-secondary"} w-full`}>
        {on ? <><Play className="h-4 w-4" />End break</> : <><Coffee className="h-4 w-4" />Take a break</>}
      </button>
      {msg && <p className="mt-1 text-xs text-amber-600">{msg}</p>}
    </div>
  );
}
