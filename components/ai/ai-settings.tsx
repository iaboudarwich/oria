"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConnectionModal } from "./connection-modal";
import {
  updateReasoningMode,
  chooseActiveAiConnection,
  disconnectAiConnection,
} from "@/lib/data/ai-connection-actions";
import type { ReasoningMode, AiConnection } from "@/lib/data/ai-connections";
import type { ConnectionStatus } from "@/lib/ai-providers";

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

/**
 * Settings -> AI: the build-together story, the user's connected AI accounts
 * (one or several) with a clear active pick, connect/remove, and the privacy
 * note. A user can connect Claude AND ChatGPT AND Gemini; one is active at a
 * time and powers Ask Oria.
 */
export function AiSettings({
  connections,
  reasoningMode,
}: {
  connections: AiConnection[];
  reasoningMode: ReasoningMode;
}) {
  const t = useTranslations("ai");
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
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

  const active = connections.find((c) => c.isActive) ?? null;
  const activeName = active ? PROVIDER_NAME[active.provider] ?? active.provider : "";
  const confirmConn = connections.find((c) => c.id === confirmId) ?? null;

  function makeActive(id: string) {
    startTransition(async () => {
      await chooseActiveAiConnection(id);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await disconnectAiConnection(id);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("settings_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("settings_subtitle")}</p>
      </div>

      {/* Connected accounts */}
      <div className="space-y-2">
        {connections.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-raised p-4">
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
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
              {connections.map((c) => {
                const name = PROVIDER_NAME[c.provider] ?? c.provider;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                        {name}
                        {c.isActive ? (
                          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10.5px] font-medium text-success">
                            {t("active_badge")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-faint">{statusLabel(c.status)}</p>
                    </div>
                    {!c.isActive ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => makeActive(c.id)}
                        className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink transition-base hover:bg-canvas disabled:opacity-50"
                      >
                        {t("make_active")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirmId(c.id)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-claret transition-base hover:bg-canvas disabled:opacity-50"
                    >
                      {t("remove")}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-[12.5px] text-ink-muted transition-base hover:text-ink"
            >
              {t("add_another")}
            </button>
          </>
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
        {active ? <p className="text-[12px] text-ink-faint">{t("dt_byo_note", { name: activeName })}</p> : null}
      </div>

      {/* Privacy: the key selects the model, never grants data access. */}
      <div className="rounded-xl border border-line bg-canvas px-4 py-3 space-y-1.5">
        <p className="text-[12.5px] font-medium text-ink">{t("data_principle_title")}</p>
        <p className="text-[12.5px] text-ink-muted">{t("data_principle_body")}</p>
        <p className="text-[12.5px] text-ink-muted">{t("privacy_body")}</p>
      </div>

      <ConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={() => startTransition(() => router.refresh())}
      />

      {confirmConn ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setConfirmId(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-ink">
              {t("disconnect_confirm_title", { name: PROVIDER_NAME[confirmConn.provider] ?? confirmConn.provider })}
            </h3>
            <p className="mt-1 text-[13px] text-ink-muted">{t("disconnect_confirm_body")}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
              >
                {t("disconnect_cancel")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(confirmConn.id)}
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
