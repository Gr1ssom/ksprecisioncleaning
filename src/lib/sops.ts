// Pure SOP rules (no server imports) so they can be unit tested.

export type SopScope = { clientId: string | null; locationId: string | null };

/** Form value → who the SOP applies to: "" = whole company, "client:<id>", "location:<id>". */
export function parseScope(v: string | null | undefined): SopScope {
  const [kind, ...rest] = (v ?? "").split(":");
  const id = rest.join(":").trim();
  if (kind === "client" && id) return { clientId: id, locationId: null };
  if (kind === "location" && id) return { clientId: null, locationId: id };
  return { clientId: null, locationId: null };
}
export const scopeValue = (s: SopScope) => (s.locationId ? `location:${s.locationId}` : s.clientId ? `client:${s.clientId}` : "");

/** A pasted link, tidied. Returns null for blank; throws for anything that isn't a web address. */
export function cleanLink(v: string | null | undefined): string | null {
  let raw = (v ?? "").trim();
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`; // "docs.google.com/…" pasted without https://
  const u = new URL(raw); // throws on nonsense
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Not a web link");
  if (!u.hostname.includes(".")) throw new Error("Not a web link");
  u.protocol = "https:";
  return u.toString();
}

export const isGoogleDrive = (url: string) => {
  try { return /(^|\.)(drive|docs)\.google\.com$/.test(new URL(url).hostname); } catch { return false; }
};

/** Does this SOP apply at a location? Company SOPs always; client SOPs at that client's sites. */
export function sopApplies(s: SopScope, loc: { id: string; clientId: string | null }) {
  if (s.locationId) return s.locationId === loc.id;
  if (s.clientId) return s.clientId === loc.clientId;
  return true;
}

export const SOP_FILE_MAX = 7_000_000; // server actions accept 8 MB bodies
export const SOP_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*";
const EXT_OK = /\.(pdf|docx?|xlsx?|pptx?|txt|png|jpe?g|webp|heic)$/i;
/** Why a file can't be used as an SOP, or null when it is fine. */
export function sopFileProblem(f: { name: string; size: number }): string | null {
  if (!EXT_OK.test(f.name)) return "That file type isn't supported. Use a PDF, Word, Excel, PowerPoint, text or image file, or link it from Google Drive.";
  if (f.size > SOP_FILE_MAX) return "That file is over 7 MB. Put it in Google Drive and paste the link instead.";
  return null;
}
