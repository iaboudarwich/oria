export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function relativeTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function classifyMime(mime: string | null | undefined): {
  label: string;
  group: "image" | "pdf" | "audio" | "doc" | "other";
} {
  if (!mime) return { label: "File", group: "other" };
  if (mime.startsWith("image/")) return { label: "Image", group: "image" };
  if (mime === "application/pdf") return { label: "PDF", group: "pdf" };
  if (mime.startsWith("audio/")) return { label: "Audio", group: "audio" };
  if (mime.includes("word") || mime.includes("document") || mime === "text/plain")
    return { label: "Doc", group: "doc" };
  return { label: mime.split("/").pop() ?? "File", group: "other" };
}
