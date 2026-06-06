"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFocusNext } from "@/lib/hooks/use-focus-next";
import type { ProviderName } from "@/lib/ai-providers";

/**
 * Per-provider get-a-key guide. `console` is the exact page; `steps` name the
 * exact page, section, and button the user clicks, so there is no guessing.
 * The button/section labels are the provider's own UI text, kept literal.
 */
type Step = [key: string, vars: Record<string, string>];
const PROVIDERS: {
  id: ProviderName;
  name: string;
  console: string;
  steps: Step[];
}[] = [
  {
    id: "anthropic",
    name: "Claude",
    console: "https://console.anthropic.com/settings/keys",
    steps: [
      ["step_open_at", { page: "console.anthropic.com" }],
      ["step_go_to", { section: "API Keys" }],
      ["step_create_named", { button: "Create Key" }],
      ["step_paste", {}],
    ],
  },
  {
    id: "openai",
    name: "ChatGPT",
    console: "https://platform.openai.com/api-keys",
    steps: [
      ["step_open_at", { page: "platform.openai.com" }],
      ["step_go_to", { section: "API keys" }],
      ["step_create_named", { button: "Create new secret key" }],
      ["step_paste", {}],
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    console: "https://aistudio.google.com/app/apikey",
    steps: [
      ["step_open_at", { page: "aistudio.google.com" }],
      ["step_create_named", { button: "Get API key" }],
      ["step_paste", {}],
    ],
  },
];

type ModalStep = "choose" | "setup" | "done";

/**
 * Assisted "connect your AI" flow. Pick a provider, follow the exact steps to
 * create a key in its console, paste + validate, confirm. A user can run this
 * repeatedly to connect several providers. Used by onboarding and Settings.
 */
export function ConnectionModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (provider: ProviderName) => void;
}) {
  const t = useTranslations("ai");
  const [step, setStep] = useState<ModalStep>("choose");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number] | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus the next action as each step appears: the key field on setup, the
  // Done button on success (Part 1 useFocusNext).
  const keyInputRef = useFocusNext<HTMLInputElement>(step === "setup" ? "setup" : null, {
    enabled: step === "setup",
  });
  const doneRef = useFocusNext<HTMLButtonElement>(step === "done" ? "done" : null, {
    enabled: step === "done",
  });

  if (!open) return null;

  function reset() {
    setStep("choose");
    setProvider(null);
    setApiKey("");
    setShowKey(false);
    setError(null);
    setBusy(false);
  }
  function close() {
    reset();
    onClose();
  }

  async function connect() {
    if (!provider || !apiKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, apiKey: apiKey.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; status?: string };
      if (!data.ok) {
        setError(
          data.status === "out_of_credits" || data.status === "rate_limited"
            ? t("error_status")
            : t("error_invalid"),
        );
        return;
      }
      onConnected(provider.id);
      setStep("done");
    } catch {
      setError(t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "choose" ? (
          <>
            <h2 className="text-[16px] font-semibold text-ink">{t("choose_title")}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">{t("choose_subtitle")}</p>
            <div className="mt-4 space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProvider(p);
                    setApiKey("");
                    setError(null);
                    setStep("setup");
                  }}
                  className="transition-base flex w-full items-center justify-between rounded-xl border border-line bg-surface-raised px-4 py-3 text-left hover:bg-canvas"
                >
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{p.name}</span>
                    <span className="block text-[12px] text-ink-muted">{t(`desc_${p.id}`)}</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">
                    ›
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11.5px] leading-snug text-ink-faint">
              {t("data_principle_body")}
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-3 text-[12.5px] text-ink-faint hover:text-ink"
            >
              {t("cancel")}
            </button>
          </>
        ) : step === "setup" && provider ? (
          <>
            <h2 className="text-[16px] font-semibold text-ink">
              {t("setup_title", { name: provider.name })}
            </h2>
            <ol className="mt-3 space-y-1.5 text-[13px] text-ink-muted">
              {provider.steps.map(([key, vars], i) => (
                <li key={key}>
                  {i + 1}. {t(key, vars)}
                </li>
              ))}
            </ol>
            <a
              href={provider.console}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-base mt-3 inline-flex h-9 items-center rounded-lg border border-line px-3 text-[12.5px] text-ink hover:bg-canvas"
            >
              {t("open_console", { name: provider.name })}
            </a>
            <div className="mt-3">
              <label className="mb-1 block text-[12px] font-medium text-ink">
                {t("paste_label")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={keyInputRef}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("paste_placeholder")}
                  className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="text-[11.5px] text-ink-faint hover:text-ink"
                >
                  {showKey ? t("hide") : t("show")}
                </button>
              </div>
            </div>
            {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="text-[12.5px] text-ink-faint hover:text-ink"
              >
                {t("back")}
              </button>
              <button
                type="button"
                onClick={connect}
                disabled={busy || !apiKey.trim()}
                className="transition-base rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
              >
                {busy ? t("validating") : t("validate")}
              </button>
            </div>
          </>
        ) : step === "done" && provider ? (
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sage/15 text-[18px] text-[#3f5240]">
              ✓
            </div>
            <h2 className="mt-3 text-[16px] font-semibold text-ink">{t("success")}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              {t("success_body", { name: provider.name })}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setProvider(null);
                  setApiKey("");
                  setError(null);
                  setStep("choose");
                }}
                className="transition-base rounded-lg border border-line px-4 py-2 text-[13px] text-ink hover:bg-canvas"
              >
                {t("connect_another")}
              </button>
              <button
                ref={doneRef}
                type="button"
                onClick={close}
                className="transition-base rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-surface hover:bg-ink-soft"
              >
                {t("done")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
