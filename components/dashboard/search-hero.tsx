import { LiveSearch } from "@/components/search/live-search";

/**
 * Calm Spotlight-feel wrapper around LiveSearch. Used on the dashboard home
 * to anchor the page emotionally around "Ask Oria anything" rather than
 * around the upload box.
 *
 * Visual treatment is intentionally subtle: a small intro line, a slightly
 * larger placeholder, and the same elevated search bar everyone already
 * knows. No marketing-y hero gradient or oversized headline.
 */
export function SearchHero() {
  return (
    <section className="space-y-2">
      <p className="px-1 text-[11.5px] uppercase tracking-[0.14em] text-ink-faint">
        Ask Oria
      </p>
      <LiveSearch placeholder="Find a receipt, see your week, check a reminder…" />
      <p className="px-1 text-[11.5px] text-ink-faint">
        Search across your uploads, reminders, and sections.{" "}
        <kbd className="rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-muted">
          ⌘K
        </kbd>{" "}
        from anywhere.
      </p>
    </section>
  );
}
