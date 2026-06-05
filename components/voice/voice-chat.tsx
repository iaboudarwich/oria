"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MicButton } from "@/components/ui/mic-button";
import { SpeakerIcon } from "@/components/ui/icon";
import type { Locale } from "@/i18n/config";

type Phase = "idle" | "thinking" | "answered" | "error";

const BCP47: Record<string, string> = { en: "en-US", ar: "ar-SA", fr: "fr-FR", es: "es-ES" };

/**
 * Voice conversation entry on the Today home (Round 19.5). Press-to-talk: tap
 * the mic, speak, tap again to stop. Speech-to-text reuses the EXISTING Whisper
 * pipeline (MicButton -> /api/transcribe). The transcript is shown, then sent to
 * /api/voice/ask (the same Ask data path, voice mode = short spoken answer), and
 * the answer is both shown AND spoken. Speech-out chain: cloud tts-1 -> browser
 * SpeechSynthesis -> text-only (logged). v1 ANSWERS only; it never acts.
 *
 * The mic animation honors prefers-reduced-motion (handled globally in
 * globals.css). A short privacy line sits under the mic.
 */
export function VoiceChat() {
  const t = useTranslations("voiceChat");
  const locale = useLocale() as Locale;
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const browserSpeak = useCallback(
    (text: string): boolean => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof window.SpeechSynthesisUtterance === "undefined"
      ) {
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
      // 1. Cloud tts-1 (same key as Whisper).
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
        // fall through to the browser
      }
      // 2. Browser SpeechSynthesis (zero-config).
      if (browserSpeak(text)) return;
      // 3. Neither worked: stay text-only and record it once.
      void fetch("/api/voice/tts-unavailable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "no_cloud_or_browser" }),
      });
    },
    [browserSpeak],
  );

  const ask = useCallback(
    async (transcript: string) => {
      setHeard(transcript);
      setAnswer("");
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
        const data = (await res.json()) as { answer?: string };
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
    [speak],
  );

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
            <p className="text-[13px] text-claret">{t("error")}</p>
          ) : answer ? (
            <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="text-[13.5px] text-ink">
                <span className="text-ink-faint">{t("oria")}: </span>
                {answer}
              </p>
              <button
                type="button"
                onClick={() => speak(answer)}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-base hover:text-ink"
              >
                <SpeakerIcon size={13} />
                {speaking ? t("speaking") : t("replay")}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-ink-faint">{t("privacy")}</p>
    </section>
  );
}
