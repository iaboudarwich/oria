import {
  ChatIcon,
  DocumentIcon,
  MicIcon,
  PaperclipIcon,
} from "@/components/ui/icon";
import { classifyMime } from "@/lib/utils";

type ThumbnailProps = {
  mime: string | null;
  imageUrl?: string | null;
  filename: string;
  size?: number;
};

/**
 * A small square preview used inline in upload lists.
 * Shows a real image thumbnail for image uploads, an icon for everything else.
 */
export function Thumbnail({ mime, imageUrl, filename, size = 32 }: ThumbnailProps) {
  const group = classifyMime(mime).group;

  if (group === "image" && imageUrl) {
    return (
      <span
        className="block shrink-0 overflow-hidden rounded-md border border-line bg-canvas"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={filename}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const Icon =
    group === "image"
      ? PaperclipIcon
      : group === "pdf"
        ? DocumentIcon
        : group === "audio"
          ? MicIcon
          : group === "doc"
            ? ChatIcon
            : DocumentIcon;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.45)} />
    </span>
  );
}
