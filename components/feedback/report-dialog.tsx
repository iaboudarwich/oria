"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icon";
import { getLastAction } from "@/lib/breadcrumbs";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Resolved server-side and threaded in; omitted on pre-auth surfaces. */
  userId?: string;
};

type ReportContext = {
  url: string;
  userId: string;
  browser: string;
  viewport: string;
  recentAction: string;
};

// Build the auto-included technical summary entirely client-side. We keep
// the path but drop the query string: signed-URL tokens live there.
function collectContext(userId?: string): ReportContext {
  if (typeof window === "undefined") {
    return {
      url: "",
      userId: userId ?? "unknown",
      browser: "",
      viewport: "",
      recentAction: "none",
    };
  }
  return {
    url: window.location.origin + window.location.pathname,
    userId: userId ?? "anonymous",
    browser: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    recentAction: getLastAction() ?? "none",
  };
}

export function ReportDialog({ open, onClose, userId }: Props) {
  const t = useTranslations("feedback");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [prevOpen, setPrevOpen] = useState(open);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot the technical context for the moment the dialog is open.
  const context = useMemo<ReportContext | null>(
    () => (open ? collectContext(userId) : null),
    [open, userId],
  );

  // Reset the form when the dialog transitions to open. Done in render
  // (React's documented "adjust state on prop change" pattern) rather than
  // in an effect, so there's no extra paint with stale content.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setText("");
      setStatus("idle");
    }
  }

  // Move focus to the textarea once the dialog is open.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "sending") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, status, onClose]);

  if (!open) return null;

  async function submit() {
    if (status === "sending" || !text.trim()) return;
    setStatus("sending");
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), context }),
      });
    } catch {
      // Even if the network call fails we still acknowledge: the report is
      // best-effort and we never want to trap the user in an error state
      // inside the error reporter itself.
    }
    setStatus("done");
    window.setTimeout(onClose, 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        onClick={() => status !== "sending" && onClose()}
        className="animate-fade-in absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="animate-scale-in relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
        {status === "done" ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-title text-ink">{t("thanks")}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <h2 id="report-dialog-title" className="text-title text-ink">
                {t("title")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="transition-base -mt-1 -mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint hover:text-ink"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <label className="mt-4 block">
              <span className="text-body-sm mb-1.5 block text-ink-muted">
                {t("description_label")}
              </span>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={t("description_placeholder")}
                className="text-body transition-base block w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-ink outline-none placeholder:text-ink-faint focus:border-ink"
              />
            </label>

            {context ? (
              <div className="text-body-sm mt-3 rounded-xl border border-line bg-canvas px-3.5 py-3 text-ink-muted">
                <p className="mb-1.5 text-ink-soft">{t("context_note")}</p>
                <dl className="space-y-0.5">
                  <ContextRow label={t("url")} value={context.url} />
                  <ContextRow label={t("browser")} value={context.browser} />
                  <ContextRow label={t("viewport")} value={context.viewport} />
                  <ContextRow label={t("recent")} value={context.recentAction} />
                </dl>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={submit}
                disabled={status === "sending" || !text.trim()}
              >
                {status === "sending" ? t("sending") : t("submit")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-faint">{label}:</dt>
      <dd className="truncate text-ink-muted">{value}</dd>
    </div>
  );
}
