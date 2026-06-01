import Link from "next/link";

/**
 * A thin tab bar for switching between a section's views (e.g. Overview vs
 * Spend, Files vs Trips/Timeline). Server-rendered; each tab is a link that
 * sets a ?view query param.
 */
export function SectionViewTabs({
  tabs,
  active,
}: {
  tabs: Array<{ key: string; label: string; href: string }>;
  active: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <nav className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-body-sm transition-base ${
            active === t.key
              ? "border-ink text-ink font-medium"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
