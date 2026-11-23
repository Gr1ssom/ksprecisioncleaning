import "server-only";
import { admin } from "./supabase/server";

const BUCKET = "media";

/** Upload an image File (from a form) to the private media bucket. Returns its storage path. */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (file.size > 10_000_000) throw new Error("Photo is too large (10 MB max). Take it again at a lower size.");
  const ext = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin().storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Upload a data: URL (e.g. a resized floor-plan image from the editor). */
export async function uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Not an image");
  const bytes = Buffer.from(m[2], "base64");
  return uploadImage(new File([bytes], "image", { type: m[1] }), folder);
}

/** Short-lived signed URLs for private images (paths → url). */
export async function signedUrls(paths: (string | null | undefined)[], seconds = 3600): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter(Boolean) as string[])];
  if (!list.length) return {};
  const { data } = await admin().storage.from(BUCKET).createSignedUrls(list, seconds);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

export async function removeImages(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await admin().storage.from(BUCKET).remove(list);
}

/** Upload an SOP document (PDF, Office, text or image) to the private media bucket. */
export async function uploadDoc(file: File, folder: string): Promise<string> {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? "bin").toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin().storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}
