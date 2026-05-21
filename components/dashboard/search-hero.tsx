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
    <section>
      <LiveSearch placeholder="Find a receipt, see your week, check a reminder…" />
    </section>
  );
}
