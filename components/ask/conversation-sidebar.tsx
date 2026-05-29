"use client";

import { useState, useTransition } from "react";
import { StarIcon, TrashIcon } from "@/components/ui/icon";
import {
  deleteConversationAction,
  starConversationAction,
} from "@/lib/data/conversation-actions";
import type { Conversation } from "@/lib/data/conversations";

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

  const visible = starredOnly
    ? conversations.filter((c) => c.starred)
    : conversations;

  function handleStar(id: string, current: boolean) {
    const next = !current;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: next } : c))
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
    <aside className="hidden w-56 shrink-0 lg:block">
      <div className="flex items-center justify-between px-1 mb-2">
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          History
        </p>
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
      </div>

      {visible.length === 0 ? (
        <p className="px-1 text-[12px] text-ink-faint">No starred conversations.</p>
      ) : (
        <ul className="space-y-0.5">
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
