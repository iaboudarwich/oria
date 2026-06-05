import { getCurrentContext } from "@/lib/data/organizations";
import type { OrgKind } from "@/lib/supabase/types";
import { StatusStrip } from "./status-strip";
import { CommandSearchButton } from "@/components/command/command-search-button";
import { BackButton } from "./back-button";

type TopbarProps = {
  title: string;
  subtitle?: string;
  /** Show a visible Back control (a fallback for the swipe-back gesture). */
  back?: { href: string; label?: string };
};

/**
 * Personal and Work spaces are auto-named "{Name}'s workspace". That reads
 * wrong for a personal space, so relabel the type word by space kind for the
 * breadcrumb. Spaces the user named themselves (circles, named offices) have
 * no "workspace" token and pass through unchanged.
 */
function spaceCrumb(name: string | null, kind: OrgKind | undefined): string | null {
  if (!name) return name;
  if (kind === "personal") return name.replace(/workspace/gi, "Personal");
  if (kind === "office") return name.replace(/workspace/gi, "Work");
  return name;
}

/**
 * Page chrome. A thin eyebrow above the title names the active space.
 * "Personal", "Office Building A", "Family". so the user never loses
 * their grounding when bouncing between Workspaces and Circles.
 * Topbar is async because it reads getCurrentContext, which is cached
 * by React for the duration of the render so this is free in practice.
 */
export async function Topbar({ title, subtitle, back }: TopbarProps) {
  const ctx = await getCurrentContext();
  const spaceName = spaceCrumb(
    ctx?.organization.name ?? null,
    ctx?.organization.kind,
  );
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-canvas/85 px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] backdrop-blur sm:-mx-6 sm:px-6 sm:pb-4 sm:pt-[max(1.5rem,env(safe-area-inset-top))] lg:-mx-10 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 pl-12 lg:pl-0">
          {back ? (
            <div className="-ml-2.5 mb-0.5">
              <BackButton href={back.href} label={back.label} />
            </div>
          ) : null}
          {spaceName ? (
            <p className="truncate text-[12px] text-ink-muted">
              <span className="font-medium text-ink">{spaceName}</span>
              <span className="mx-1.5 text-ink-faint">›</span>
              <span>{title}</span>
            </p>
          ) : null}
          {/* Page title uses the design-system text-title token so every
              page lands at the same confident weight + size. Subtitle uses
              ink-soft (one shade darker than ink-muted) so it reads as
              supporting copy rather than fine print. */}
          <h1 className="mt-0.5 text-title text-ink">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-[13.5px] text-ink-soft">{subtitle}</p>
          ) : null}
        </div>
        <div className="shrink-0">
          <CommandSearchButton />
        </div>
      </div>
      <StatusStrip />
    </header>
  );
}
