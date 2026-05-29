"use client";

import { useState, useRef, useCallback } from "react";
import type { Locale } from "@/i18n/config";

type MicButtonProps = {
  onTranscribed: (text: string) => void;
  targetLanguage?: Locale;
  size?: "sm" | "md" | "lg";
  className?: string;
};

type RecordingState = "idle" | "recording" | "transcribing" | "error";

function MicIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
 * Tap-to-start, tap-to-stop voice dictation button.
 * Sends audio to /api/transcribe, calls onTranscribed with the result.
 * Renders nothing if MediaRecorder is unavailable.
 */
export function MicButton({
  onTranscribed,
  targetLanguage,
  size = "md",
  className = "",
}: MicButtonProps) {
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


  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStop = useCallback(async () => {
    stopTimer();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) {
      setState("idle");
      return;
    }

    setState("transcribing");
    try {
      const mimeType = mediaRef.current?.mimeType ?? "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });

      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      if (targetLanguage) form.append("target_language", targetLanguage);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string; message?: string };
        throw new Error(data.message ?? data.error ?? "Transcription failed");
      }
      const data = (await res.json()) as { text: string };
      if (data.text) {
        onTranscribed(data.text);
      }
      setState("idle");
      setError(null);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Transcription failed");
      setTimeout(() => { setState("idle"); setError(null); }, 3000);
    }
  }, [onTranscribed, targetLanguage, stopTimer]);

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
        stream.getTracks().forEach((t) => t.stop());
        void handleStop();
      };
      recorder.start();
      mediaRef.current = recorder;
      startTimeRef.current = Date.now();
      setState("recording");
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      const msg = err instanceof Error && err.name === "NotAllowedError"
        ? "Microphone permission denied. Enable it in browser settings."
        : "Could not access microphone.";
      setState("error");
      setError(msg);
      setTimeout(() => { setState("idle"); setError(null); }, 4000);
    }
  }

  function stopRecording() {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.stop();
    }
  }

  function handleClick() {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      void startRecording();
    }
  }

  if (!supported) return null;

  const iconSize = size === "lg" ? 22 : size === "md" ? 16 : 13;
  const btnSize = size === "lg"
    ? "h-14 w-14"
    : size === "md"
    ? "h-9 w-9"
    : "h-7 w-7";

  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isTranscribing}
        title={
          error ??
          (isRecording ? "Stop recording" : "Start voice dictation")
        }
        className={`${btnSize} inline-flex items-center justify-center rounded-full transition-base
          ${isRecording
            ? "bg-claret text-surface animate-pulse"
            : isTranscribing
            ? "bg-ink/10 text-ink-faint cursor-wait"
            : state === "error"
            ? "bg-claret/10 text-claret"
            : "bg-canvas border border-line text-ink-muted hover:bg-surface-raised hover:text-ink"
          }
          disabled:cursor-wait`}
      >
        {isTranscribing ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-ink-faint border-t-transparent animate-spin" />
        ) : (
          <MicIcon size={iconSize} />
        )}
      </button>

      {/* Recording duration */}
      {isRecording && (
        <span className="mt-0.5 text-[10px] text-claret tabular-nums">
          {formatDuration(elapsed)}
        </span>
      )}

      {/* Error tooltip */}
      {state === "error" && error && (
        <div className="absolute bottom-full mb-1 w-48 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-surface shadow-md z-50">
          {error}
        </div>
      )}
    </div>
  );
}
