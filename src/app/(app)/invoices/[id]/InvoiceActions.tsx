"use client";
import { useTransition } from "react";
import { sendInvoiceToWave, setInvoiceStatus } from "@/app/actions/billing";

export function InvoiceActions({ id, status, wave }: { id: string; status: string; wave: boolean }) {
  const [p, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <button disabled={p} className="btn-primary" onClick={() => start(() => sendInvoiceToWave(id))}>{p ? "Sending…" : "Send with Wave"}</button>
      )}
      {status === "DRAFT" && !wave && (
        <button disabled={p} className="btn-secondary" onClick={() => start(() => setInvoiceStatus(id, "SENT"))}>Mark sent</button>
      )}
      {status === "SENT" && <button disabled={p} className="btn-primary" onClick={() => start(() => setInvoiceStatus(id, "PAID"))}>Mark paid</button>}
      {status !== "VOID" && status !== "PAID" && (
        <button disabled={p} className="btn-secondary" onClick={() => { if (confirm("Void this invoice? Its visits become billable again.")) start(() => setInvoiceStatus(id, "VOID")); }}>Void</button>
      )}
    </div>
  );
}
