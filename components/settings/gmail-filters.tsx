"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveConnectionFilters } from "@/lib/integrations/gmail/connection-actions";

type Config = {
  excludeKeywords: string[];
  excludeSenders: string[];
  excludeWithAttachments: boolean;
  workspaceRouting: "personal" | "work" | "auto";
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
};

export type SpaceOption = { id: string; name: string; kind: string };

/** Chip input: a list of strings with add (Enter) and per-chip remove. */
function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-[12px] text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="transition-base text-ink-faint hover:text-claret"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={placeholder}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
    </div>
  );
}

/**
 * Confidentiality + workspace-routing controls for the Gmail connection.
 * Saving writes straight through; the next scan honours the new filters.
 */
export function GmailFilters({
  connectionId,
  initial,
  spaces = [],
}: {
  connectionId: string;
  initial: Config;
  spaces?: SpaceOption[];
}) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [keywords, setKeywords] = useState(initial.excludeKeywords);
  const [senders, setSenders] = useState(initial.excludeSenders);
  const [attachments, setAttachments] = useState(initial.excludeWithAttachments);
  const [mode, setMode] = useState<Config["routingMode"]>(initial.routingMode);
  const [targets, setTargets] = useState<string[]>(initial.routingTargetOrgIds);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggleTarget(id: string) {
    setTargets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveConnectionFilters(connectionId, {
        excludeKeywords: keywords,
        excludeSenders: senders,
        excludeWithAttachments: attachments,
        workspaceRouting: "auto",
        routingMode: mode,
        routingTargetOrgIds: mode === "fixed" ? targets : [],
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      <div>
        <p className="text-[12.5px] font-medium text-ink">{t("filter_keywords")}</p>
        <p className="mb-1.5 text-[11.5px] text-ink-faint">{t("filter_keywords_hint")}</p>
        <ChipInput values={keywords} onChange={setKeywords} placeholder={t("filter_add")} />
      </div>

      <div>
        <p className="text-[12.5px] font-medium text-ink">{t("filter_senders")}</p>
        <ChipInput values={senders} onChange={setSenders} placeholder={t("filter_add")} />
      </div>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={attachments}
          onChange={(e) => setAttachments(e.target.checked)}
          className="h-3.5 w-3.5 accent-ink"
        />
        <span className="text-[12.5px] text-ink-soft">{t("filter_attachments")}</span>
      </label>

      <div>
        <p className="text-[12.5px] font-medium text-ink">{t("filter_routing")}</p>
        <div className="mt-1.5 flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={`route-mode-${connectionId}`}
              checked={mode === "auto"}
              onChange={() => setMode("auto")}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink"
            />
            <span className="text-[12.5px] text-ink-soft">{t("route_mode_auto")}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={`route-mode-${connectionId}`}
              checked={mode === "fixed"}
              onChange={() => setMode("fixed")}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink"
            />
            <span className="text-[12.5px] text-ink-soft">{t("route_mode_fixed")}</span>
          </label>
        </div>
        {mode === "fixed" ? (
          <div className="mt-2 flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2">
            {spaces.length === 0 ? (
              <p className="text-[11.5px] text-ink-faint">{t("route_no_spaces")}</p>
            ) : (
              spaces.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={targets.includes(s.id)}
                    onChange={() => toggleTarget(s.id)}
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  <span className="text-[12.5px] text-ink-soft">{s.name}</span>
                </label>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="transition-base rounded-lg bg-ink px-4 py-1.5 text-[12.5px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? t("filter_saving") : t("filter_save")}
        </button>
        {saved && !pending ? (
          <span className="text-[12px] text-ink-faint">{t("filter_saved")}</span>
        ) : null}
      </div>
    </div>
  );
}
