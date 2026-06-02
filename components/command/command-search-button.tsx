"use client";

import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/ui/icon";
import { COMMAND_OPEN_EVENT } from "./command-palette";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** Visible top-bar entry point to the command palette (mirrors Cmd/Ctrl+K). */
export function CommandSearchButton() {
  const t = useTranslations("command");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(COMMAND_OPEN_EVENT))}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[12.5px] text-ink-muted transition-base hover:border-line-strong hover:text-ink"
      aria-label={t("title")}
    >
      <SearchIcon size={14} />
      <span className="hidden sm:inline">{t("button")}</span>
      <span className="hidden rounded border border-line px-1 text-[10.5px] text-ink-faint sm:inline">
        {isMac ? "⌘K" : "Ctrl K"}
      </span>
    </button>
  );
}
