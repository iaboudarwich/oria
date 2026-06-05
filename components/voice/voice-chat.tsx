"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MicButton } from "@/components/ui/mic-button";
import { SpeakerIcon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { executeWriteAction, undoWriteAction } from "@/lib/data/write-action-runner";
import type { ProposedAction } from "@/lib/actions/write-actions";
import type { Locale } from "@/i18n/config";

type Phase = "idle" | "thinking" | "answered" | "confirm" | "error";
const BCP47: Record<string, string> = { en: "en-US", ar: "ar-SA", fr: "fr-FR", es: "es-ES" };
const UNDO_SECONDS = 60;

/**
 * Voice conversation + actions (Round 19.5 + 21). Press-to-talk: tap, speak, tap
 * to stop. STT reuses the Whisper pipeline; answers reuse the Ask data path and
 * are spoken (cloud tts-1 -> browser -> text). Round 21: a reminder COMMAND is
 * detected, Oria speaks + shows the exact confirmation, and ONLY on confirm does
 * it execute through the write-back rails (idempotent, audited), then offers a
 * 60s undo that fully reverses. Ambiguous (no time) asks rather than acts.
 */
export function VoiceChat() {
  const t = useTranslations("voiceChat");
  const tv = useTranslations("voiceAct");
  const locale = useLocale() as Locale;
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [proposed, setProposed] = useState<ProposedAction | null>(null);
  const [undo, setUndo] = useState<{ actionId: string; secs: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const undoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const browserSpeak = useCallback(
    (text: string): boolean => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance === "undefined") {
        return false;
      }
      try {
        const u = new window.SpeechSynthesisUtterance(text);
        u.lang = BCP47[locale] ?? "en-US";
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        return true;
      } catch {
        return false;
      }
    },
    [locale],
  );

  const speak = useCallback(
    async (text: string) => {
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
          const url = URL.createObjectURL(await res.blob());
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;
          audio.src = url;
          audio.onplay = () => setSpeaking(true);
          audio.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
          };
          await audio.play();
          return;
        }
      } catch {
        /* fall through */
      }
      if (browserSpeak(text)) return;
      void fetch("/api/voice/tts-unavailable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "no_cloud_or_browser" }),
      });
    },
    [browserSpeak],
  );

  const whenLabel = useCallback(
    (action: ProposedAction): string => {
      if (action.type !== "reminder.create" || !action.date || !action.time) return "";
      const d = new Date(`${action.date}T${action.time}`);
      if (Number.isNaN(d.getTime())) return `${action.date} ${action.time}`;
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    },
    [],
  );

  const confirmText = useCallback(
    (action: ProposedAction): string => {
      if (action.type === "reminder.create") {
        return tv("confirm_reminder", { when: whenLabel(action), title: action.title });
      }
      return tv("confirm_generic");
    },
    [tv, whenLabel],
  );

  const ask = useCallback(
    async (transcript: string) => {
      setHeard(transcript);
      setAnswer("");
      setProposed(null);
      setPhase("thinking");
      try {
        const res = await fetch("/api/voice/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        });
        if (!res.ok) {
          setPhase("error");
          return;
        }
        const data = (await res.json()) as
          | { kind: "answer"; answer: string }
          | { kind: "clarify"; reason: string }
          | { kind: "action"; action: ProposedAction };
        if (data.kind === "action") {
          setProposed(data.action);
          setPhase("confirm");
          const text = confirmText(data.action);
          setAnswer(text);
          void speak(text);
          return;
        }
        if (data.kind === "clarify") {
          const q = tv(`clarify_${data.reason}` as "clarify_missing_when");
          setAnswer(q);
          setPhase("answered");
          void speak(q);
          return;
        }
        const text = (data.answer ?? "").trim();
        if (!text) {
          setPhase("error");
          return;
        }
        setAnswer(text);
        setPhase("answered");
        void speak(text);
      } catch {
        setPhase("error");
      }
    },
    [confirmText, speak, tv],
  );

  const startUndoWindow = useCallback((actionId: string) => {
    if (undoTimer.current) clearInterval(undoTimer.current);
    setUndo({ actionId, secs: UNDO_SECONDS });
    undoTimer.current = setInterval(() => {
      setUndo((u) => {
        if (!u) return null;
        if (u.secs <= 1) {
          if (undoTimer.current) clearInterval(undoTimer.current);
          return null; // window closed: the action is committed
        }
        return { ...u, secs: u.secs - 1 };
      });
    }, 1000);
  }, []);

  function confirm() {
    if (!proposed) return;
    const action = proposed;
    const summary = confirmText(action);
    const actionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    setProposed(null);
    setPhase("answered");
    void (async () => {
      const res = await executeWriteAction({ actionId, action, summary });
      if (res.ok) {
        const done = tv("done");
        setAnswer(done);
        void speak(done);
        startUndoWindow(actionId);
      } else {
        setAnswer(tv("failed"));
        setPhase("error");
      }
    })();
  }

  function cancel() {
    setProposed(null);
    setPhase("answered");
    setAnswer(tv("cancelled"));
  }

  function doUndo() {
    if (!undo) return;
    const id = undo.actionId;
    if (undoTimer.current) clearInterval(undoTimer.current);
    setUndo(null);
    void (async () => {
      await undoWriteAction(id);
      const msg = tv("undone");
      setAnswer(msg);
      void speak(msg);
    })();
  }

  return (
    <section className="rounded-2xl border border-line bg-surface-raised p-5">
      <div className="flex items-center gap-4">
        <MicButton size="lg" onTranscribed={ask} targetLanguage={locale} breatheWhenIdle={phase === "idle"} />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{t("subtitle")}</p>
        </div>
      </div>

      {(heard || phase !== "idle") && (
        <div className="mt-4 space-y-2">
          {heard ? (
            <p className="text-[13px] text-ink-soft">
              <span className="text-ink-faint">{t("you")}: </span>
              {heard}
            </p>
          ) : null}
          {phase === "thinking" ? (
            <p className="text-[13px] text-ink-muted">{t("thinking")}</p>
          ) : phase === "error" ? (
            <p className="text-[13px] text-claret">{answer || t("error")}</p>
          ) : answer ? (
            <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[13.5px] text-ink">
                <span className="text-ink-faint">{t("oria")}: </span>
                {answer}
              </p>

              {phase === "confirm" ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={confirm}>
                    {tv("confirm_yes")}
                  </Button>
                  <button
                    type="button"
                    onClick={cancel}
                    className="text-[12px] text-ink-muted transition-base hover:text-ink"
                  >
                    {tv("confirm_no")}
                  </button>
                </div>
              ) : undo ? (
                <button
                  type="button"
                  onClick={doUndo}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-muted transition-base hover:text-ink"
                >
                  {tv("undo")} ({undo.secs})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => speak(answer)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-base hover:text-ink"
                >
                  <SpeakerIcon size={13} />
                  {speaking ? t("speaking") : t("replay")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-ink-faint">{t("privacy")}</p>
    </section>
  );
}
