import {
  ChatIcon,
  DocumentIcon,
  DownloadIcon,
  MicIcon,
  PaperclipIcon,
} from "@/components/ui/icon";
import { classifyMime } from "@/lib/utils";

type PreviewProps = {
  url: string | null;
  mime: string | null;
  filename: string;
};

export function Preview({ url, mime, filename }: PreviewProps) {
  if (!url) {
    return <UnavailableState />;
  }
  const group = classifyMime(mime).group;

  if (group === "image") {
    return (
      <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-line bg-canvas">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          className="max-h-[720px] w-auto object-contain"
        />
      </div>
    );
  }

  if (group === "pdf") {
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
        <iframe
          src={url}
          title={filename}
          className="h-[720px] w-full"
        />
      </div>
    );
  }

  if (group === "audio") {
    return (
      <div className="rounded-2xl border border-line bg-surface-raised p-6">
        <div className="flex items-center gap-3 mb-4">
          <MicIcon size={16} />
          <p className="text-[13.5px] text-ink">{filename}</p>
        </div>
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  return <GenericPreview url={url} mime={mime} filename={filename} />;
}

function GenericPreview({
  url,
  mime,
  filename,
}: {
  url: string;
  mime: string | null;
  filename: string;
}) {
  const c = classifyMime(mime);
  const Icon =
    c.group === "doc" ? ChatIcon : c.group === "image" ? PaperclipIcon : DocumentIcon;
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-surface-raised px-6 py-20 text-center">
      <Icon size={28} />
      <div>
        <p className="text-[14px] text-ink">{filename}</p>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          Preview not available in browser.
        </p>
      </div>
      <a
        href={url}
        download={filename}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] text-surface hover:bg-ink-soft transition-base"
      >
        <DownloadIcon size={12} /> Download
      </a>
    </div>
  );
}

function UnavailableState() {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised px-6 py-20 text-center">
      <p className="text-[13.5px] text-ink-muted">Preview unavailable.</p>
    </div>
  );
}
