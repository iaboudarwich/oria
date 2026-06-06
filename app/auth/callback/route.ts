import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTrustedDevice } from "@/lib/auth/trusted-device";

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
      // Gate magic-link landings through the second-factor prompt when the
      // user has a verified factor, UNLESS this is a trusted device (same rule
      // as password sign-in, Round 16.7).
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const hasSecondFactor = aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1";
      const { data: userData } = await supabase.auth.getUser();
      const trusted =
        hasSecondFactor && userData.user ? await isTrustedDevice(userData.user.id) : false;
      if (hasSecondFactor && !trusted) {
        const params = new URLSearchParams({ next });
        return NextResponse.redirect(new URL(`/login/mfa?${params.toString()}`, url.origin));
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
