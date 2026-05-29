import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles email confirmation / magic-link callbacks.
// Supabase redirects to /auth/callback?code=... after the user clicks the link.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Gate magic-link landings through the MFA prompt when the user
      // has a verified TOTP factor — same rule as password sign-in.
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1") {
        const params = new URLSearchParams({ next });
        return NextResponse.redirect(
          new URL(`/login/mfa?${params.toString()}`, url.origin),
        );
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
