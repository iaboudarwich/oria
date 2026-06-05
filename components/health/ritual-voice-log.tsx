"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/components/ui/icon";
import { MicButton } from "@/components/ui/mic-button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { markRitualByText } from "@/lib/data/ritual-actions";
import type { Locale } from "@/i18n/config";

/**
 * Mark a ritual done by voice or text, reusing the shared mic (Whisper) +
 * auto-grow composer already used across the Health surfaces. Matching is
 * deterministic by ritual name (no AI); an unclear note asks the user to name
 * the ritual rather than guessing.
 */
export function RitualVoiceLog() {
  const t = useTranslations("health");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  function submit() {
    const value = text.trim();
    if (!value || pending) return;
    setMsg(null);
    setErr(false);
    startTransition(async () => {
      const res = await markRitualByText(value);
      if (res.ok) {
        setText("");
        setMsg(t("ritual_marked", { title: res.title ?? "" }));
        setErr(false);
        router.refresh();
        window.setTimeout(() => setMsg(null), 4000);
      } else {
        setMsg(t("ritual_no_match"));
        setErr(true);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="rounded-2xl border border-line bg-surface-raised p-3 space-y-2"
    >
      <AutoGrowTextarea
        value={text}
        onChange={(v) => {
          setText(v);
          setMsg(null);
          setErr(false);
        }}
        placeholder={t("log_ritual_ph")}
        minRows={1}
        maxRows={4}
        className="block w-full rounded-xl bg-canvas/40 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:bg-canvas"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] ${err ? "text-claret" : "text-ink-muted"}`}>
          {pending ? t("saving") : msg ? msg : t("log_ritual_label")}
        </p>
        <div className="flex items-center gap-2">
          <MicButton
            size="sm"
            onTranscribed={(tr) => {
              setText(text ? `${text} ${tr}` : tr);
              setMsg(null);
              setErr(false);
            }}
            targetLanguage={locale}
          />
          <button
            type="submit"
            disabled={pending || text.trim().length === 0}
            className="cta inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
          >
            {t("ritual_mark")}
            <ArrowRightIcon size={11} />
          </button>
        </div>
      </div>
    </form>
  );
}
