"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { createClient } from "@/lib/supabase/client";
import { recordPasswordReset } from "@/lib/auth/actions";

const MIN_LEN = 8;

type Phase = "verifying" | "twostep" | "ready" | "invalid";

/** A verified second factor on the account (shape kept loose so SDK status
 *  literals don't break the build between versions). */
type VerifiedFactor = { id: string; friendly_name?: string | null };

/**
 * The set-new-password step.
 *
 * The recovery token arrives in the URL (hash for the implicit flow, or
 * ?code / ?token_hash) and is NEVER seen by the server. This client consumes
 * it into a real session BEFORE the form submits.
 *
 * If the account has a second factor (an authentication app), the recovery
 * session lands at the lower trust level and the provider refuses a password
 * change until it is elevated. So when a verified factor exists we ask for the
 * 6-digit code, verify it to elevate the session, THEN show the password form.
 * Accounts with no second factor go straight to the password form, unchanged.
 */
export function ResetClient({
  strengthLabels,
}: {
  strengthLabels: [string, string, string, string, string];
}) {
  const t = useTranslations("auth");
  const [phase, setPhase] = useState<Phase>("verifying");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Second-factor step state.
  const [factors, setFactors] = useState<VerifiedFactor[]>([]);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [twoError, setTwoError] = useState<"wrong" | "expired" | null>(null);
  const [checking, setChecking] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Once a session exists, branch on whether the account needs a second
    // factor before the password can be changed.
    async function resolveAfterSession() {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsSecondFactor = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
      if (!needsSecondFactor) {
        if (active) setPhase("ready");
        return;
      }
      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = (
        (list?.totp ?? []) as { id: string; status: string; friendly_name?: string | null }[]
      )
        .filter((f) => f.status === "verified")
        .map((f) => ({ id: f.id, friendly_name: f.friendly_name }));
      if (!active) return;
      if (verified.length === 0) {
        // Edge case: elevation wanted but no usable factor. Let the password
        // form try; the provider decides.
        setPhase("ready");
        return;
      }
      setFactors(verified);
      setFactorId(verified[0].id);
      setPhase("twostep");
    }

    async function consume() {
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        const sp = new URLSearchParams(window.location.search);
        const hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        try {
          const at = hp.get("access_token");
          const rt = hp.get("refresh_token");
          const codeParam = sp.get("code");
          const tokenHash = sp.get("token_hash");
          if (at && rt) {
            await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          } else if (codeParam) {
            await supabase.auth.exchangeCodeForSession(codeParam);
          } else if (tokenHash) {
            await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
          }
        } catch {
          // fall through; getSession below decides valid vs invalid
        }
        ({ data } = await supabase.auth.getSession());
      }
      if (!active) return;
      if (data.session) await resolveAfterSession();
      else setPhase("invalid");
    }

    // detectSessionInUrl fires PASSWORD_RECOVERY when it consumes the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        void resolveAfterSession();
      }
    });

    void consume();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Verify the 6-digit code to elevate the recovery session, then reveal the
  // password form. A fresh challenge is created per attempt, so "expired" is
  // rare; we still classify it so the message tells the user what to do.
  async function onVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (checking || !factorId) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setTwoError("wrong");
      return;
    }
    setChecking(true);
    setTwoError(null);
    const supabase = createClient();
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        setTwoError("expired");
        setChecking(false);
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: digits,
      });
      if (vErr) {
        const expired = /expir/i.test(vErr.message);
        setTwoError(expired ? "expired" : "wrong");
        setCode("");
        setChecking(false);
        codeRef.current?.focus();
        return;
      }
      // Session is now elevated; the password form can update the password.
      setPhase("ready");
    } catch {
      setTwoError("wrong");
      setChecking(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < MIN_LEN) {
      setError(t("pw_min_8"));
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) {
      // Never surface the raw provider error; show a plain message.
      setError(t("reset_update_failed"));
      setSaving(false);
      return;
    }
    await recordPasswordReset();
    window.location.href = "/dashboard";
  }

  if (phase === "verifying") {
    return (
      <p className="text-body-sm mt-6 text-center text-ink-muted" role="status" aria-live="polite">
        {t("reset_verifying")}
      </p>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="mt-6 space-y-4 text-center">
        <p
          role="status"
          className="text-body-sm rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-3 text-claret"
        >
          {t("reset_invalid")}
        </p>
        <Link href="/auth/forgot" className="text-body-sm block text-brand hover:opacity-80">
          {t("reset_request_new")}
        </Link>
      </div>
    );
  }

  if (phase === "twostep") {
    return (
      <form className="mt-6 space-y-3" onSubmit={onVerifyCode} noValidate>
        <div className="text-center">
          <h2 className="text-title text-ink">{t("twostep_title")}</h2>
          <p className="text-body-sm mt-1.5 text-ink-muted">{t("twostep_help")}</p>
        </div>

        {factors.length > 1 ? (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[12.5px] font-medium text-ink">
              {t("twostep_choose")}
            </legend>
            {factors.map((f, i) => (
              <label
                key={f.id}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-raised px-3 py-2 text-[13px] text-ink"
              >
                <input
                  type="radio"
                  name="factor"
                  value={f.id}
                  checked={factorId === f.id}
                  onChange={() => setFactorId(f.id)}
                  className="accent-brand"
                />
                {f.friendly_name || t("twostep_app_n", { n: i + 1 })}
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink">
            {t("twostep_code_label")}
          </span>
          <input
            ref={codeRef}
            type="text"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            required
            aria-invalid={twoError ? true : undefined}
            aria-describedby={twoError ? "twostep-error" : undefined}
            className="transition-base block h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] tracking-[0.3em] text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-[3px] focus:ring-brand/12"
          />
        </label>

        <div id="twostep-error" aria-live="assertive">
          {twoError === "wrong" ? (
            <p
              role="alert"
              className="rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret"
            >
              {t("twostep_wrong")}
            </p>
          ) : twoError === "expired" ? (
            <button
              type="submit"
              className="transition-base block w-full rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-start text-[13px] text-claret hover:bg-claret/10"
            >
              {t("twostep_expired")}
            </button>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={checking}
          aria-busy={checking}
        >
          {checking ? (
            <>
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
              {t("twostep_checking")}
            </>
          ) : (
            t("twostep_submit")
          )}
        </Button>
      </form>
    );
  }

  return (
    <form className="mt-6 space-y-3" onSubmit={onSubmit} noValidate>
      <PasswordField
        label={t("new_password_label")}
        name="password"
        placeholder={t("new_password_placeholder")}
        autoComplete="new-password"
        required
        minLength={MIN_LEN}
        showStrength
        strengthLabels={strengthLabels}
      />
      {error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? (
          <>
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            {t("reset_saving")}
          </>
        ) : (
          t("reset_submit")
        )}
      </Button>
    </form>
  );
}
