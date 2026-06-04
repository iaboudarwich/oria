"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  HeartIcon,
  HomeIcon,
  LockIcon,
  SearchIcon,
} from "@/components/ui/icon";
import { switchSpace } from "@/lib/data/space-actions";
import type { SpaceSummary } from "@/components/dashboard/space-switcher";
import type { OrgKind } from "@/lib/supabase/types";

const KIND_ICON: Record<OrgKind, React.ComponentType<{ size?: number }>> = {
  personal: HomeIcon,
  circle: HeartIcon,
  office: LockIcon,
};

/**
 * The OUTER rail of the two-rail sidebar (Round 14.8 F2, heuristics §7). A
 * 56px icon-only column of the user's contexts (spaces), pinned to the very
 * start of the viewport on lg+. The existing Sidebar is the inner rail; it and
 * the page content sit to the inline-end of this rail via the --rail-w var.
 * Hidden on mobile, where the inner rail's drawer already carries the space
 * switcher.
 *
 * The bottom holds the always-reachable global actions (Ask, add a space): the
 * persistent action cluster, integrated into the rail rather than a second
 * full-width bar that would double the per-page Topbar.
 */
export function ContextRail({
  spaces,
  activeId,
  addHref,
}: {
  spaces: SpaceSummary[];
  activeId: string;
  addHref: string;
}) {
  const router = useRouter();
  const t = useTranslations("sidebar");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function go(s: SpaceSummary) {
    if (s.id === activeId) return;
    setPendingId(s.id);
    startTransition(async () => {
      const result = await switchSpace(s.id);
      if (result.ok) router.push(s.kind === "office" ? "/dashboard/work" : "/dashboard");
      else setPendingId(null);
    });
  }

  return (
    <nav
      aria-label={t("contexts")}
      className="fixed inset-y-0 left-0 z-50 hidden w-14 flex-col items-center border-e border-line glass py-3 lg:flex"
    >
      <Link
        href="/dashboard"
        aria-label="Oria"
        className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-surface"
      >
        O
      </Link>

      <ul className="flex flex-1 flex-col items-center gap-1.5">
        {spaces.map((s) => {
          const Icon = KIND_ICON[s.kind] ?? HomeIcon;
          const active = s.id === activeId || s.id === pendingId;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s)}
                aria-label={s.name}
                aria-current={s.id === activeId ? "true" : undefined}
                title={s.name}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition-base ${
                  active
                    ? "bg-brand-muted text-brand"
                    : "text-ink-muted hover:bg-canvas/60 hover:text-ink"
                }`}
              >
                <Icon size={18} />
              </button>
            </li>
          );
        })}
        <li>
          <Link
            href={addHref}
            aria-label={t("add_space")}
            title={t("add_space")}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[18px] leading-none text-ink-faint transition-base hover:bg-canvas/60 hover:text-ink"
          >
            +
          </Link>
        </li>
      </ul>

      <Link
        href="/dashboard/ask"
        aria-label={t("ask")}
        title={t("ask")}
        className="mt-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-base hover:bg-canvas/60 hover:text-ink"
      >
        <SearchIcon size={18} />
      </Link>
    </nav>
  );
}
