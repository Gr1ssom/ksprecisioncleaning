"use client";
import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { compressImage } from "@/lib/clientImage";

/**
 * A photo picker that shrinks the picture on the phone before the form sends it.
 * `autoSubmit` sends the surrounding form as soon as a photo is picked (room photos).
 */
export function PhotoInput({ name = "photo", label = "Add photo", autoSubmit, className = "btn-secondary w-full" }: {
  name?: string; label?: string; autoSubmit?: boolean; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "working" | "ready">("idle");
  const [preview, setPreview] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const file = el.files?.[0];
    if (!file) return;
    setState("working");
    const small = await compressImage(file);
    try {
      const dt = new DataTransfer();
      dt.items.add(small);
      el.files = dt.files; // the form now sends the small JPEG
    } catch { /* very old browsers: keep the original */ }
    setPreview(URL.createObjectURL(small));
    setState("ready");
    if (autoSubmit) el.form?.requestSubmit();
  }

  return (
    <div className="space-y-2">
      <label className={className}>
        <Camera className="h-4 w-4" />{state === "working" ? "Preparing…" : label}
        <input ref={input} type="file" name={name} accept="image/*" capture="environment" className="hidden" onChange={onChange} />
      </label>
      {preview && !autoSubmit && <img src={preview} alt="Photo to upload" className="h-20 w-20 rounded-md object-cover" />}
    </div>
  );
}
