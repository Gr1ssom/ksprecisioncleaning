"use client";
import { useState, useTransition } from "react";
import { Copy, Mail, MessageSquare } from "lucide-react";

/**
 * A client link with "Copy link" and "Text link" (opens the phone's messages app), plus "Email"
 * when an email sender is set up. Without one it says so, so nobody waits for an email that
 * never goes out.
 */
export function ShareLink({ url, text, email, emailReady }: {
  url: string; text: string; emailReady: boolean;
  email?: () => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this link", url); }
  };
  return (
    <div className="space-y-2">
      <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-secondary"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy link"}</button>
        <a href={`sms:?&body=${encodeURIComponent(`${text} ${url}`)}`} className="btn-secondary"><MessageSquare className="h-4 w-4" />Text link</a>
        {email && emailReady && (
          <button type="button" disabled={pending} className="btn-secondary"
            onClick={() => start(async () => { const r = await email(); setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Emailed." }); })}>
            <Mail className="h-4 w-4" />{pending ? "Sending…" : "Email"}
          </button>
        )}
      </div>
      {!emailReady && <p className="text-xs text-slate-500">Email isn&apos;t set up yet (needs a sender: RESEND_API_KEY and EMAIL_FROM). Copy or text the link for now.</p>}
      {msg && <p className={`rounded-lg p-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
    </div>
  );
}
