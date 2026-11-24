import "server-only";
import { headers } from "next/headers";
import { getSetting } from "./settings";

/**
 * Email to clients (visit reports, portal links) through Resend, when the server has
 * RESEND_API_KEY and EMAIL_FROM (an address on a domain verified in Resend). Without them the app
 * shows "Copy link" / "Text link" instead, so a manager can send it themselves.
 */
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
export const EMAIL_SETUP_HINT = "Email isn't set up yet: add a sender (RESEND_API_KEY and EMAIL_FROM) to send it automatically. Until then, copy or text the link.";

export async function sendEmail(m: { to: string; subject: string; text: string; html: string }) {
  if (!emailConfigured()) throw new Error(EMAIL_SETUP_HINT);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`The email service refused it (${res.status}${body?.message ? `: ${body.message}` : ""}). Check the sender settings, or copy the link instead.`);
  }
}

/** The app's public address for links in emails and texts: the saved app address, else this request's host. */
export async function baseUrl() {
  const saved = await getSetting<string>("appUrl");
  if (saved) return saved.replace(/\/+$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  } catch { /* outside a request */ }
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, black-and-white email with one button. */
export function linkEmail(p: { greeting: string; lines: string[]; button: string; url: string }) {
  const text = `${p.greeting}\n\n${p.lines.join("\n\n")}\n\n${p.button}: ${p.url}\n\nKS Precision Cleaning LLC`;
  const html = `<div style="font-family:Montserrat,Arial,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
<p style="font-family:Georgia,serif;font-size:22px;font-weight:900;margin:0 0 16px">KS Precision Cleaning</p>
<p>${esc(p.greeting)}</p>${p.lines.map((l) => `<p>${esc(l)}</p>`).join("")}
<p style="margin:24px 0"><a href="${esc(p.url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(p.button)}</a></p>
<p style="font-size:12px;color:#555">Or open this link: ${esc(p.url)}</p></div>`;
  return { text, html };
}
