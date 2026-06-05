import type { ReactNode } from "react";
import { STATUS_VAR, STATUS_TRACK, toneForScore, type StatusTone } from "@/lib/ui/status-color";

/**
 * Score ring/dial: an SVG arc for a 0 to 100 style score (recovery, sleep,
 * a goal). Size + color via props; the color defaults to the one-meaning-per-
 * color status tone for the score (low = needs attention, high = good), and the
 * track sits behind in the same hue, tinted (the home-target dial look). Pass
 * `colorVar` / `trackVar` to drive a named data series directly (recovery,
 * sleep, strain, spend) from DATA_VAR / DATA_TRACK in lib/ui/status-color.
 * Hand-rolled inline SVG, no chart library, no animation (reduced-motion safe).
 */
export function ScoreRing({
  score,
  size = 92,
  tone,
  colorVar,
  trackVar,
  center,
  caption,
  ariaLabel,
}: {
  score: number;
  size?: number;
  /** Override the auto tone (good/warn/bad/info/neutral). */
  tone?: StatusTone;
  /** Explicit arc color (a CSS var), e.g. DATA_VAR.recovery. Wins over tone. */
  colorVar?: string;
  /** Explicit track color (a CSS var), e.g. DATA_TRACK.recovery. */
  trackVar?: string;
  /** Overlaid center content; defaults to the rounded score. */
  center?: ReactNode;
  caption?: string;
  ariaLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const stroke = Math.max(6, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;
  const resolvedTone = tone ?? toneForScore(clamped);
  const color = colorVar ?? STATUS_VAR[resolvedTone];
  const track = trackVar ?? STATUS_TRACK[resolvedTone];

  return (
    <figure className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={ariaLabel ?? `${Math.round(clamped)} of 100`}
        >
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {center ?? (
            <span className="num text-[20px] font-semibold text-ink">{Math.round(clamped)}</span>
          )}
        </div>
      </div>
      {caption ? <figcaption className="text-[11.5px] text-ink-muted">{caption}</figcaption> : null}
    </figure>
  );
}
