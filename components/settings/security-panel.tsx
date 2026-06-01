"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  enrollStart,
  enrollVerify,
  disable,
} from "@/lib/auth/mfa-actions";

type Props = {
  /** True when the user already has a verified TOTP factor. */
  enrolled: boolean;
  /** Count of unused backup codes (only meaningful when enrolled). */
  backupCodesLeft: number;
};

type EnrollState =
  | { stage: "idle" }
  | { stage: "qr"; factorId: string; qrCode: string; secret: string }
  | { stage: "codes"; backupCodes: string[]; acked: boolean }
  | { stage: "done" };

/**
 * Security panel — the user-facing surface for TOTP 2FA.
 *
 * State machine when ENABLING:
 *   idle → press "Enable" → calls enrollStart() → server returns
 *   factor id + QR data URL → we show the QR + secret →
 *   user types the 6-digit code from their authenticator app →
 *   enrollVerify() returns 10 backup codes → we show them with a
 *   required acknowledgement checkbox → "I've saved these" enables
 *   the close button → state becomes done → page refreshes to
 *   show the new enrolled state.
 *
 * When DISABLING:
 *   the user types their password AND a current 6-digit (or backup)
 *   code. disable() unenrolls the factor, clears backup codes, and
 *   clears profiles.mfa_enrolled_at. We refresh the page.
 *
 * No client-side state ever holds the TOTP secret or backup codes
 * past the enrollment session. Plaintext backup codes never persist
 * server-side either; only their SHA-256 hashes do.
 */
export function SecurityPanel({ enrolled, backupCodesLeft }: Props) {
  if (enrolled) return <EnrolledView backupCodesLeft={backupCodesLeft} />;
  return <NotEnrolledView />;
}

/* ----- Not enrolled view (start enrollment) ------------------------ */

function NotEnrolledView() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<EnrollState>({ stage: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await enrollStart();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState({
        stage: "qr",
        factorId: result.factorId,
        qrCode: result.qrCode,
        secret: result.secret,
      });
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (state.stage !== "qr") return;
    setError(null);
    const formData = new FormData();
    formData.set("factor_id", state.factorId);
    formData.set("code", code);
    startTransition(async () => {
      const result = await enrollVerify(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState({
        stage: "codes",
        backupCodes: result.backupCodes,
        acked: false,
      });
    });
  }

  function finish() {
    if (state.stage === "codes" && !state.acked) return;
    setState({ stage: "done" });
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <Header
        title="Two-factor authentication"
        description="Add a second step at sign-in using an authenticator app. We strongly recommend turning this on before storing anything sensitive."
      />

      {state.stage === "idle" && (
        <>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button onClick={start} disabled={pending} variant="primary">
            {pending ? "Setting up…" : "Enable two-factor auth"}
          </Button>
        </>
      )}

      {state.stage === "qr" && (
        <div className="space-y-4 rounded-2xl border border-line bg-canvas p-5">
          <p className="text-[13.5px] text-ink">
            Scan this code with your authenticator app (1Password, Authy,
            Google Authenticator, etc.), then enter the 6-digit code it
            displays.
          </p>
          {/* The QR data URL comes back from Supabase as inline SVG. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.qrCode}
            alt="MFA QR code"
            className="mx-auto block h-48 w-48 rounded-lg border border-line bg-surface"
          />
          <details className="text-[12.5px] text-ink-muted">
            <summary className="cursor-pointer hover:text-ink">
              Can&apos;t scan? Show secret
            </summary>
            <code className="mt-2 block break-all rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[12px] text-ink">
              {state.secret}
            </code>
          </details>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <form onSubmit={verify} className="space-y-3">
            <label className="block">
              <span className="block mb-1.5 text-[12.5px] font-medium text-ink">
                6-digit code
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="123456"
                required
                autoFocus
                className="block h-11 w-full rounded-xl border border-line bg-surface-raised px-3 text-[16px] tabular-nums text-ink placeholder:text-ink-faint outline-none transition-base focus:border-brand focus:ring-[3px] focus:ring-brand/12"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Verifying…" : "Verify and enable"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setState({ stage: "idle" })}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {state.stage === "codes" && (
        <BackupCodesPanel
          codes={state.backupCodes}
          acked={state.acked}
          onAck={(v) =>
            setState({ ...state, acked: v })
          }
          onClose={finish}
          pending={pending}
        />
      )}

      {state.stage === "done" && (
        <p className="text-[13px] text-ink-muted">Two-factor auth is on. Refreshing…</p>
      )}
    </section>
  );
}

/* ----- Enrolled view (disable flow) -------------------------------- */

function EnrolledView({ backupCodesLeft }: { backupCodesLeft: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onDisable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await disable(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowDisable(false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <Header
        title="Two-factor authentication"
        description="Two-factor auth is on. Every sign-in asks for a code from your authenticator app."
      />

      <div className="rounded-2xl border border-line bg-canvas p-4">
        <p className="text-[13.5px] text-ink">
          <span className="inline-flex h-5 items-center rounded-full bg-sage/10 px-2 text-[11.5px] font-medium text-sage">
            On
          </span>
          <span className="ml-2 text-ink-muted">
            {backupCodesLeft} of 10 backup codes remaining.
          </span>
        </p>
        {backupCodesLeft <= 3 && (
          <p className="mt-2 text-[12.5px] text-claret">
            Running low. Disable and re-enable 2FA to mint a new set.
          </p>
        )}
      </div>

      {!showDisable ? (
        <Button
          variant="secondary"
          onClick={() => setShowDisable(true)}
          className="text-claret hover:border-claret/40"
        >
          Disable two-factor auth
        </Button>
      ) : (
        <form
          onSubmit={onDisable}
          className="space-y-3 rounded-2xl border border-claret/30 bg-claret/[0.03] p-5"
        >
          <p className="text-[13px] text-ink">
            Disabling 2FA requires your password AND a current code from
            your authenticator app (or one of your backup codes).
          </p>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <label className="block">
            <span className="block mb-1.5 text-[12.5px] font-medium text-ink">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="block h-11 w-full rounded-xl border border-line bg-surface-raised px-3 text-[16px] text-ink outline-none transition-base focus:border-brand focus:ring-[3px] focus:ring-brand/12"
            />
          </label>
          <label className="block">
            <span className="block mb-1.5 text-[12.5px] font-medium text-ink">
              6-digit code or backup code
            </span>
            <input
              name="code"
              type="text"
              autoComplete="one-time-code"
              placeholder="123456 or xxxxx-xxxxx"
              required
              className="block h-11 w-full rounded-xl border border-line bg-surface-raised px-3 text-[16px] text-ink outline-none transition-base focus:border-brand focus:ring-[3px] focus:ring-brand/12"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Disabling…" : "Disable 2FA"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowDisable(false);
                setError(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ----- Backup-codes display panel ---------------------------------- */

function BackupCodesPanel({
  codes,
  acked,
  onAck,
  onClose,
  pending,
}: {
  codes: string[];
  acked: boolean;
  onAck: (v: boolean) => void;
  onClose: () => void;
  pending: boolean;
}) {
  function copyAll() {
    void navigator.clipboard?.writeText(codes.join("\n"));
  }

  // Rendered as a modal (not an inline panel) so the one-time codes can't be
  // scrolled past or dismissed by accident. There is no close affordance other
  // than the acknowledgement-gated Done button: matches the beta-disclaimer
  // pattern. No backdrop-click or Escape dismissal.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-codes-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
      />
      <div className="relative z-[101] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl animate-scale-in">
        <div>
          <h3 id="backup-codes-title" className="text-[16px] font-semibold text-ink">
            Save these backup codes
          </h3>
          <p className="mt-1 text-[13px] text-ink-muted">
            Each code works once if you lose access to your authenticator app.
            We show them only this once. Store them somewhere safe (a password
            manager works well).
          </p>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-2">
          {codes.map((c) => (
            <li
              key={c}
              className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink"
            >
              {c}
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={copyAll}
            className="text-[12.5px] font-medium text-brand underline underline-offset-2 transition-base hover:opacity-80"
          >
            Copy all
          </button>
        </div>

        <label className="mt-4 flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => onAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          I&apos;ve stored these backup codes somewhere safe.
        </label>

        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            variant="primary"
            disabled={!acked || pending}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----- Tiny shared bits -------------------------------------------- */

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
      {children}
    </p>
  );
}
