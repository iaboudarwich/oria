import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Shared chrome for the standalone auth screens (verify, forgot, reset,
 * authenticator recovery): centered card on the canvas with the wordmark
 * above. Matches the visual language of the sign-in card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -start-40 -top-40 h-[600px] w-[600px] rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative z-10 mb-8">
        <Wordmark />
      </div>

      <div className="animate-scale-in relative z-10 w-full max-w-[400px]">
        <div className="rounded-2xl border border-line bg-surface-raised px-8 py-8 shadow-xl">
          <div className="text-center">
            <h1 className="text-title text-ink">{title}</h1>
            {subtitle ? <p className="text-body-sm mt-1.5 text-ink-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
