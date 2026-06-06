"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import {
  nextRecordingState,
  isBusy,
  isPressed,
  type RecordingState,
} from "@/lib/voice/recording-machine";

type MicButtonProps = {
  onTranscribed: (text: string) => void;
  targetLanguage?: Locale;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, the idle state pulses with the slow mic-breathe rhythm
   *  to draw attention as a primary action (used in the onboarding
   *  chat). Default is false. secondary placements stay still. */
  breatheWhenIdle?: boolean;
};

function MicIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The single, reusable voice-input affordance (Round 14.8 F4). Tap to record,
 * tap to stop; audio goes to /api/transcribe (Whisper) and the result is passed
 * to onTranscribed. Renders nothing if MediaRecorder is unavailable.
 *
 * Accessibility: a real <button> (Enter/Space activate), an aria-label that
 * tracks state, aria-pressed for the recording toggle, a polite aria-live
 * status so screen-reader users hear recording / transcribing / error, and a
 * 44px minimum target at md/lg. State runs through the pure recording machine.
 */
export function MicButton({
  onTranscribed,
  targetLanguage,
  size = "md",
  className = "",
  breatheWhenIdle = false,
}: MicButtonProps) {
  const t = useTranslations("voice");
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [supported] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return typeof window.MediaRecorder !== "undefined";
  });

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const dispatch = useCallback((event: Parameters<typeof nextRecordingState>[1]) => {
    setState((s) => nextRecordingState(s, event));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const failTransient = useCallback((message: string, ms: number) => {
    setError(message);
    setState((s) => nextRecordingState(s, { type: "FAIL" }));
    setTimeout(() => {
      setState((s) => nextRecordingState(s, { type: "RESET" }));
      setError(null);
    }, ms);
  }, []);

  const handleStop = useCallback(async () => {
    stopTimer();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) {
      dispatch({ type: "EMPTY" });
      return;
    }

    dispatch({ type: "STOP" });
    try {
      const mimeType = mediaRef.current?.mimeType ?? "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });

      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      if (targetLanguage) form.append("target_language", targetLanguage);

      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string; message?: string };
        throw new Error(data.message ?? data.error ?? t("error_failed"));
      }
      const data = (await res.json()) as { text: string };
      if (data.text) onTranscribed(data.text);
      dispatch({ type: "TRANSCRIBED" });
      setError(null);
    } catch (err) {
      failTransient(err instanceof Error ? err.message : t("error_failed"), 3000);
    }
  }, [dispatch, failTransient, onTranscribed, stopTimer, t, targetLanguage]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        void handleStop();
      };
      recorder.start();
      mediaRef.current = recorder;
      startTimeRef.current = Date.now();
      dispatch({ type: "START" });
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError" ? t("error_denied") : t("error_mic");
      failTransient(msg, 4000);
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
    }
  }

  function handleClick() {
    if (state === "recording") stopRecording();
    else if (state === "idle") void startRecording();
  }

  if (!supported) return null;

  const iconSize = size === "lg" ? 22 : size === "md" ? 18 : 14;
  // 44px minimum target at md/lg (heuristics §1.8 / WCAG). sm stays compact for
  // dense inline composers.
  const btnSize = size === "lg" ? "h-14 w-14" : size === "md" ? "h-11 w-11" : "h-9 w-9";

  const recording = state === "recording";
  const transcribing = isBusy(state);

  // Status announced to assistive tech (polite). Empty while idle.
  const status = recording
    ? t("recording")
    : transcribing
      ? t("transcribing")
      : state === "error"
        ? (error ?? t("error_failed"))
        : "";
  const label = recording ? t("stop") : t("start");

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={transcribing}
        aria-label={label}
        aria-pressed={isPressed(state)}
        title={error ?? label}
        className={`${btnSize} transition-base inline-flex items-center justify-center rounded-full ${
          recording
            ? "animate-mic-breathe bg-claret text-surface"
            : transcribing
              ? "cursor-wait bg-ink/10 text-ink-faint"
              : state === "error"
                ? "bg-claret/10 text-claret"
                : `border border-line bg-canvas text-ink-muted hover:bg-surface-raised hover:text-ink ${breatheWhenIdle ? "animate-mic-breathe" : ""}`
        } disabled:cursor-wait`}
      >
        {transcribing ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-faint border-t-transparent" />
        ) : (
          <MicIcon size={iconSize} />
        )}
      </button>

      {/* Recording duration */}
      {recording && (
        <span className="mt-0.5 text-[10px] text-claret tabular-nums" aria-hidden>
          {formatDuration(elapsed)}
        </span>
      )}

      {/* Polite live status for screen readers, plus a visible error tooltip. */}
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
      {state === "error" && error && (
        <div className="absolute bottom-full z-50 mb-1 w-48 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-surface shadow-md">
          {error}
        </div>
      )}
    </div>
  );
}
