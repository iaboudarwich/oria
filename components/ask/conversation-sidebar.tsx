"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { StarIcon, TrashIcon, ChevronDownIcon } from "@/components/ui/icon";
import {
  deleteConversationAction,
  starConversationAction,
} from "@/lib/data/conversation-actions";
import type { Conversation } from "@/lib/data/conversations";

const STORAGE_KEY = "oria:ask:sidebar_collapsed";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ConversationSidebar({
  conversations: initial,
}: {
  conversations: Conversation[];
}) {
  const [conversations, setConversations] = useState(initial);
  const [starredOnly, setStarredOnly] = useState(false);
  const [, startTransition] = useTransition();

  // ── Collapse state ────────────────────────────────────────────────────────
  // Initialise from localStorage; default collapsed on mobile (< 768px).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "true";
    // Default: collapsed on mobile
    return window.innerWidth < 768;
  });

  // Sync collapse state to localStorage on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  // Close on backdrop click (mobile overlay mode).
  const handleBackdropClick = useCallback(() => setCollapsed(true), []);

  const visible = starredOnly
    ? conversations.filter((c) => c.starred)
    : conversations;

  function handleStar(id: string, current: boolean) {
    const next = !current;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: next } : c)),
    );
    startTransition(() => {
      void starConversationAction(id, next);
    });
  }

  function handleDelete(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    startTransition(() => {
      void deleteConversationAction(id);
    });
  }

  if (conversations.length === 0) return null;

  return (
    <>
      {/* Mobile overlay backdrop — renders when sidebar is expanded on small screens */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 bg-ink/10 md:hidden"
          onClick={handleBackdropClick}
          aria-hidden
        />
      )}

      {/* Collapsed tab — narrow strip with expand chevron */}
      {collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand history"
          title="History"
          className="hidden lg:flex shrink-0 w-6 items-start pt-1 text-ink-faint transition-base hover:text-ink"
        >
          {/* Right-pointing chevron when collapsed */}
          <span className="rotate-[-90deg]">
            <ChevronDownIcon size={14} />
          </span>
        </button>
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          // Base
          "shrink-0 overflow-hidden transition-[width,transform] duration-200 ease-out",
          // Desktop: animate width
          collapsed ? "hidden lg:block lg:w-0" : "hidden lg:block lg:w-56",
          // Mobile: overlay that slides in from the left
          !collapsed
            ? "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-canvas px-4 py-6 shadow-xl md:hidden"
            : "",
          // Respect reduced motion
          "motion-reduce:transition-none",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Conversation history"
      >
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            History
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStarredOnly((v) => !v)}
              title={starredOnly ? "Show all" : "Show starred"}
              className={`rounded p-0.5 transition-base ${
                starredOnly
                  ? "text-amber-500"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              <StarIcon size={12} />
            </button>
            {/* Collapse button inside sidebar */}
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse history"
              title="Collapse"
              className="rounded p-0.5 text-ink-faint transition-base hover:text-ink"
            >
              {/* Left-pointing chevron when open */}
              <span className="rotate-90">
                <ChevronDownIcon size={12} />
              </span>
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-1 text-[12px] text-ink-faint">
            No starred conversations.
          </p>
        ) : (
          <ul className="space-y-0.5 overflow-y-auto">
            {visible.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                onStar={() => handleStar(c.id, c.starred)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </ul>
        )}
      </aside>

      {/* Mobile expand tab (small screens only, visible when collapsed) */}
      {collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Expand history"
          className="md:hidden fixed top-1/2 left-0 z-40 -translate-y-1/2 flex items-center justify-center h-12 w-5 rounded-r-md border border-l-0 border-line bg-surface-raised text-ink-faint shadow-sm transition-base hover:text-ink"
        >
          <ChevronDownIcon size={11} className="rotate-[-90deg]" />
        </button>
      )}
    </>
  );
}

function ConversationRow({
  conversation: c,
  onStar,
  onDelete,
}: {
  conversation: Conversation;
  onStar: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="group rounded-xl px-2 py-2 hover:bg-surface-raised">
      <p className="truncate text-[12.5px] text-ink leading-snug">
        {c.title ?? "Untitled"}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10.5px] text-ink-faint">
          {relativeTime(c.updated_at)}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onStar}
            title={c.starred ? "Unstar" : "Star"}
            className={`rounded p-0.5 transition-base ${
              c.starred
                ? "text-amber-500"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            <StarIcon size={11} />
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                className="rounded px-1 text-[10.5px] text-claret hover:underline"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1 text-[10.5px] text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              className="rounded p-0.5 text-ink-faint transition-base hover:text-claret"
            >
              <TrashIcon size={11} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
