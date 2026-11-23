"use client";
import { useActionState, useState } from "react";
import { saveSop } from "@/app/actions/manage";
import { SOP_FILE_ACCEPT, sopFileProblem } from "@/lib/sops";

export type SopScopes = { clients: { id: string; name: string }[]; locations: { id: string; name: string }[] };
type Existing = { id: string; title: string; category: string; body: string; linkUrl: string | null; fileName: string | null; filePath: string | null };

/**
 * Add or edit an SOP. It can be typed steps, a Google Drive (or any) link, an uploaded file, or a mix.
 * `scope` is who it applies to: "" company, "client:<id>", "location:<id>"; pass `scopes` to let the
 * manager choose, or leave it out to keep `scope` fixed.
 */
export function SopForm({ sop, scope = "", scopes, back }: { sop?: Existing; scope?: string; scopes?: SopScopes; back: string }) {
  const [state, action, pending] = useActionState(saveSop, null);
  const [fileError, setFileError] = useState<string | null>(null);
  const uid = sop?.id ?? `new-${scope || "company"}`;
  return (
    <form action={action} className="mt-3 space-y-3">
      {sop && <input type="hidden" name="id" value={sop.id} />}
      <input type="hidden" name="back" value={back} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div><label className="label" htmlFor={`t-${uid}`}>Title</label><input id={`t-${uid}`} name="title" defaultValue={sop?.title} className="input" required /></div>
        <div><label className="label" htmlFor={`c-${uid}`}>Category</label><input id={`c-${uid}`} name="category" defaultValue={sop?.category} placeholder="General" className="input" /></div>
      </div>
      {scopes ? (
        <div>
          <label className="label" htmlFor={`s-${uid}`}>Applies to</label>
          <select id={`s-${uid}`} name="scope" defaultValue={scope} className="input">
            <option value="">Whole company</option>
            {scopes.clients.length > 0 && <optgroup label="A client (all their locations)">{scopes.clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>}
            {scopes.locations.length > 0 && <optgroup label="One location">{scopes.locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.name}</option>)}</optgroup>}
          </select>
        </div>
      ) : <input type="hidden" name="scope" value={scope} />}
      <div>
        <label className="label" htmlFor={`l-${uid}`}>Google Drive link</label>
        <input id={`l-${uid}`} name="linkUrl" type="text" inputMode="url" defaultValue={sop?.linkUrl ?? ""} placeholder="Paste the share link" className="input" autoComplete="off" />
        <p className="mt-1 text-xs text-slate-500">
          In Drive: Share, then Copy link. Make sure your team can open it.{" "}
          <a href="https://docs.new" target="_blank" rel="noreferrer" className="underline underline-offset-2">Start a new Google Doc</a>
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`f-${uid}`}>Or upload a file</label>
        <input id={`f-${uid}`} name="file" type="file" accept={SOP_FILE_ACCEPT} className="input"
          onChange={(e) => { const f = e.target.files?.[0]; setFileError(f ? sopFileProblem(f) : null); }} />
        {sop?.filePath && (
          <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="removeFile" className="h-5 w-5" />Remove the current file ({sop.fileName ?? "file"})
          </label>
        )}
        <p className="mt-1 text-xs text-slate-500">PDF, Word, Excel, PowerPoint, text or a photo, up to 7 MB.</p>
      </div>
      <div>
        <label className="label" htmlFor={`b-${uid}`}>Or type the steps</label>
        <textarea id={`b-${uid}`} name="body" defaultValue={sop?.body} rows={5} className="input" placeholder="One step per line" />
      </div>
      {(fileError || state?.error) && <p className="text-sm text-red-600">{fileError ?? state?.error}</p>}
      <button className={sop ? "btn-secondary" : "btn-primary"} disabled={pending || !!fileError}>{pending ? "Saving…" : sop ? "Save as new version" : "Add"}</button>
      {sop && <p className="text-xs text-slate-500">Saving a new version asks everyone to read it again.</p>}
    </form>
  );
}
