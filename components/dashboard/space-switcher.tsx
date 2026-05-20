"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDownIcon,
  HeartIcon,
  HomeIcon,
  LockIcon,
} from "@/components/ui/icon";
import { switchSpace } from "@/lib/data/space-actions";
import { useDismissable } from "@/lib/hooks/use-dismissable";
import type { OrgKind } from "@/lib/supabase/types";

export type SpaceSummary = {
  id: string;
  name: string;
  kind: OrgKind;
};

type Props = {
  active: SpaceSummary;
  spaces: SpaceSummary[];
};

const KIND_ICON: Record<OrgKind, React.ComponentType<{ size?: number }>> = {
  personal: HomeIcon,
  circle: HeartIcon,
  office: LockIcon,
};

function kindSubtitle(active: SpaceSummary): string {
  if (active.kind === "personal") return "Your private space";
  if (active.kind === "circle") return "Shared circle";
  return "Workspace";
}

function kindLabel(k: OrgKind): string {
  return k === "personal" ? "Personal" : k === "circle" ? "Circle" : "Workspace";
}

export function SpaceSwitcher({ active, spaces }: Props) {
  const router = useRouter();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();
  const [pending, startTransition] = useTransition();
  // The space the user just clicked. Used to flip the chrome optimistically so
  // the switch reads as instant even before the server confirms.
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleSwitch(target: SpaceSummary) {
    if (target.id === active.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setPendingId(target.id);
    startTransition(async () => {
      const result = await switchSpace(target.id);
      if (result.ok) {
        // Client-side navigation: lands on /dashboard with the new cookie
        // already set. router.refresh() pulls a fresh RSC tree (sidebar,
        // counts, etc.).
        router.push("/dashboard");
        router.refresh();
      } else {
        setPendingId(null);
      }
    });
  }

  const displayed =
    pendingId ? spaces.find((s) => s.id === pendingId) ?? active : active;
  const DisplayedIcon = KIND_ICON[displayed.kind] ?? HomeIcon;
  const isPending = pendingId !== null;

  return (
    <div ref={ref} className="relative mx-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        disabled={pending}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border bg-canvas/60 px-3 py-2.5 text-left transition-base disabled:opacity-80 hover:border-line-strong ${
          open ? "border-line-strong" : "border-line"
        }`}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-surface">
          <DisplayedIcon size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">
            {displayed.name}
          </span>
          <span className="block text-[11px] text-ink-faint">
            {isPending ? "Switching…" : kindSubtitle(displayed)}
          </span>
        </span>
        <ChevronDownIcon
          size={13}
          className={`text-ink-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-[0_10px_30px_-15px_rgba(28,26,23,0.18)] animate-fade-up"
          role="menu"
        >
          <ul className="py-1">
            {spaces.map((s) => {
              const Icon = KIND_ICON[s.kind] ?? HomeIcon;
              const isActive = s.id === active.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(s)}
                    disabled={isActive}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-base ${
                      isActive
                        ? "bg-canvas/60 text-ink cursor-default"
                        : "text-ink-soft hover:bg-canvas/60 hover:text-ink"
                    }`}
                  >
                    <Icon size={13} />
                    <span className="flex-1 truncate">{s.name}</span>
                    {isActive ? (
                      <span className="text-[10.5px] text-ink-faint">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-ink-faint">
                        {kindLabel(s.kind).toLowerCase()}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line py-1">
            {active.kind === "office" ? (
              <Link
                href="/dashboard/work/spaces/new"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-soft transition-base hover:bg-canvas/60 hover:text-ink"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none text-ink-muted">
                  +
                </span>
                <span>Create Workspace</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard/circles/new"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-soft transition-base hover:bg-canvas/60 hover:text-ink"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center text-[14px] leading-none text-ink-muted">
                    +
                  </span>
                  <span>Create circle</span>
                </Link>
                <Link
                  href="/invite/code"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink-soft transition-base hover:bg-canvas/60 hover:text-ink"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center text-ink-muted">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  </span>
                  <span>Join a circle</span>
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
