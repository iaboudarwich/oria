"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { createClient } from "@/lib/supabase/client";
import { recordPasswordReset } from "@/lib/auth/actions";

const MIN_LEN = 8;

type Phase = "verifying" | "ready" | "invalid";

/**
 * The set-new-password step. The fix (Fix 1): the recovery token arrives in the
 * URL (hash for the implicit flow, or ?code / ?token_hash) and is NEVER seen by
 * the server. This client consumes it into a real session BEFORE the form
 * submits, then updates the password against that session, audits it, and
 * lands the now signed-in user on the dashboard. An expired / already-used
 * token shows a clear "request a new link" path.
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

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function consume() {
      // detectSessionInUrl may already have processed the hash; check first.
      let { data } = await supabase.auth.getSession();
      if (!data.session) {
        const sp = new URLSearchParams(window.location.search);
        const hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        try {
          const at = hp.get("access_token");
          const rt = hp.get("refresh_token");
          const code = sp.get("code");
          const tokenHash = sp.get("token_hash");
          if (at && rt) {
            await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          } else if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (tokenHash) {
            await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
          }
        } catch {
          // fall through; getSession below decides valid vs invalid
        }
        ({ data } = await supabase.auth.getSession());
      }
      if (active) setPhase(data.session ? "ready" : "invalid");
    }

    // detectSessionInUrl fires PASSWORD_RECOVERY when it consumes the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
        setPhase("ready");
      }
    });

    void consume();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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
      setError(upErr.message);
      setSaving(false);
      return;
    }
    // Audit server-side (the cookies the browser just wrote carry the session).
    await recordPasswordReset();
    // The recovery session is now a normal signed-in session: land on the
    // dashboard with a full navigation so the server reads the fresh cookies.
    window.location.href = "/dashboard";
  }

  if (phase === "verifying") {
    return (
      <p className="mt-6 text-center text-body-sm text-ink-muted" role="status" aria-live="polite">
        {t("reset_verifying")}
      </p>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="mt-6 space-y-4 text-center">
        <p role="status" className="rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-3 text-body-sm text-claret">
          {t("reset_invalid")}
        </p>
        <Link href="/auth/forgot" className="block text-body-sm text-brand hover:opacity-80">
          {t("reset_request_new")}
        </Link>
      </div>
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
        <p role="alert" aria-live="assertive" className="rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
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
              className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
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
