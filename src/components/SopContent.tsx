import { ExternalLink, FileText } from "lucide-react";
import { isGoogleDrive } from "@/lib/sops";

/** What staff read: typed steps, plus buttons for a linked document and/or an uploaded file. */
export function SopContent({ sop, fileUrl }: { sop: { body: string; linkUrl: string | null; filePath: string | null; fileName: string | null }; fileUrl?: string }) {
  const steps = sop.body.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="mt-3 space-y-3">
      {steps.length > 0 && <ol className="list-decimal space-y-1 pl-5 text-sm">{steps.map((l, i) => <li key={i}>{l}</li>)}</ol>}
      {(sop.linkUrl || sop.filePath) && (
        <div className="flex flex-wrap gap-2">
          {sop.linkUrl && (
            <a href={sop.linkUrl} target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink className="h-4 w-4" />{isGoogleDrive(sop.linkUrl) ? "Open in Google Drive" : "Open link"}
            </a>
          )}
          {sop.filePath && (fileUrl
            ? <a href={fileUrl} target="_blank" rel="noreferrer" className="btn-secondary"><FileText className="h-4 w-4" /><span className="max-w-[14rem] truncate">{sop.fileName ?? "Open file"}</span></a>
            : <span className="text-sm text-amber-700">The file couldn&apos;t be loaded. Refresh the page, or ask a manager to upload it again.</span>)}
        </div>
      )}
    </div>
  );
}
