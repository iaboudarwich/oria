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
};

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
              className="text-ink-faint transition-base hover:text-claret"
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
}: {
  connectionId: string;
  initial: Config;
}) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [keywords, setKeywords] = useState(initial.excludeKeywords);
  const [senders, setSenders] = useState(initial.excludeSenders);
  const [attachments, setAttachments] = useState(initial.excludeWithAttachments);
  const [routing, setRouting] = useState<Config["workspaceRouting"]>(initial.workspaceRouting);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveConnectionFilters(connectionId, {
        excludeKeywords: keywords,
        excludeSenders: senders,
        excludeWithAttachments: attachments,
        workspaceRouting: routing,
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
        <div className="mt-1.5 flex gap-1.5">
          {(["personal", "work", "auto"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setRouting(opt)}
              className={`rounded-lg px-3 py-1.5 text-[12px] transition-base ${
                routing === opt
                  ? "bg-ink text-surface"
                  : "border border-line text-ink-muted hover:text-ink"
              }`}
            >
              {t(`routing_${opt}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
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
