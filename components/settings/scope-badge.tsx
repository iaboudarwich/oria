import { PersonIcon, MapPinIcon } from "@/components/ui/icon";

/**
 * A small, consistent badge that tells the user whether a settings tab is
 * account-wide (global) or applies only to the selected scope. Presentational:
 * the page passes already-localized text so this stays server-safe.
 */
export function ScopeBadge({
  tone,
  label,
  className = "",
}: {
  tone: "account" | "scope";
  label: string;
  className?: string;
}) {
  const isAccount = tone === "account";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
        isAccount ? "border-line bg-canvas text-ink-muted" : "border-brand/30 bg-brand/10 text-ink"
      } ${className}`}
    >
      <span aria-hidden className={isAccount ? "text-ink-faint" : "text-brand"}>
        {isAccount ? <PersonIcon size={12} /> : <MapPinIcon size={12} />}
      </span>
      {label}
    </span>
  );
}
