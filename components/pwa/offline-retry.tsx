"use client";

/**
 * Retry button for the offline shell. A reload re-attempts the navigation;
 * the service worker is network-first for navigations, so once the connection
 * is back this lands on the real page instead of the offline shell.
 */
export function OfflineRetry({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="transition-base inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[13px] font-medium text-surface hover:bg-ink-soft"
    >
      {label}
    </button>
  );
}
