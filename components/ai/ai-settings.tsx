"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConnectionModal } from "./connection-modal";
import { updateReasoningMode } from "@/lib/data/ai-connection-actions";
import type { ReasoningMode } from "@/lib/data/ai-connections";
import type { ProviderName, ConnectionStatus } from "@/lib/ai-providers";

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

export type AiSettingsConnection = {
  provider: ProviderName;
  status: ConnectionStatus;
  lastValidatedAt: string | null;
} | null;

/**
 * Settings -> AI: the build-together story, the current connection state with
 * connect/disconnect, and the privacy note. All copy localized.
 */
export function AiSettings({
  connection,
  reasoningMode,
}: {
  connection: AiSettingsConnection;
  reasoningMode: ReasoningMode;
}) {
  const t = useTranslations("ai");
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<ReasoningMode>(reasoningMode);

  const REASONING_OPTIONS: { value: ReasoningMode; label: string }[] = [
    { value: "auto", label: t("rm_auto") },
    { value: "manual", label: t("rm_manual") },
    { value: "always", label: t("rm_always") },
    { value: "never", label: t("rm_never") },
  ];

  function chooseMode(next: ReasoningMode) {
    setMode(next);
    startTransition(() => updateReasoningMode(next));
  }

  const statusLabel = (s: ConnectionStatus) =>
    s === "active"
      ? t("st_active")
      : s === "invalid"
        ? t("st_invalid")
        : s === "rate_limited"
          ? t("st_rate_limited")
          : t("st_out_of_credits");

  async function disconnect() {
    await fetch("/api/ai-connections", { method: "DELETE" });
    setConfirmOpen(false);
    startTransition(() => router.refresh());
  }

  const name = connection ? PROVIDER_NAME[connection.provider] ?? connection.provider : "";

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("settings_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("settings_subtitle")}</p>
      </div>

      {/* Current state */}
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        {connection ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{t("state_connected", { name })}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {statusLabel(connection.status)}
                {connection.lastValidatedAt
                  ? ` · ${t("last_validated", { date: new Date(connection.lastValidatedAt).toLocaleDateString() })}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-claret transition-base hover:bg-canvas"
            >
              {t("disconnect")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{t("state_not_connected")}</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">{t("state_not_connected_body")}</p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-surface transition-base hover:bg-ink-soft"
            >
              {t("connect")}
            </button>
          </div>
        )}
      </div>

      {/* Story */}
      <div className="space-y-3">
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{t("story_eyes_title")}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">{t("story_eyes_body")}</p>
        </div>
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{t("story_brain_title")}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">{t("story_brain_body")}</p>
        </div>
      </div>

      {/* Deeper thinking preference */}
      <div className="space-y-3 border-t border-line pt-5">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{t("dt_title")}</h3>
          <p className="mt-1 text-[13px] text-ink-muted">{t("dt_body")}</p>
        </div>
        <div className="space-y-1.5">
          {REASONING_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 transition-base hover:bg-canvas"
            >
              <input
                type="radio"
                name="reasoning_mode"
                checked={mode === o.value}
                disabled={pending}
                onChange={() => chooseMode(o.value)}
              />
              <span className="text-[13px] text-ink">{o.label}</span>
            </label>
          ))}
        </div>
        {connection ? (
          <p className="text-[12px] text-ink-faint">{t("dt_byo_note", { name })}</p>
        ) : null}
      </div>

      {/* Privacy */}
      <div className="rounded-xl border border-line bg-canvas px-4 py-3">
        <p className="text-[12.5px] text-ink-muted">{t("privacy_body")}</p>
      </div>

      <ConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={() => startTransition(() => router.refresh())}
      />

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">{t("disconnect_confirm_title", { name })}</h3>
            <p className="mt-1 text-[13px] text-ink-muted">{t("disconnect_confirm_body")}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink">
                {t("disconnect_cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={disconnect}
                className="rounded-lg bg-claret px-3 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:opacity-90 disabled:opacity-50"
              >
                {t("disconnect_confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
