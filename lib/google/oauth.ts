import "server-only";

// Generalized Google OAuth 2.0 helpers, shared by the non-mail Google services
// (Calendar, Drive) and ready for Gmail to delegate to in a later consolidation
// pass. Reuses the same GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET app already used
// for Gmail; the redirect URI is derived from NEXT_PUBLIC_SITE_URL and must be
// registered in the Google Cloud console. Never logs tokens.
//
// Scope choices (privacy-first):
//   drive    -> drive.file      (non-restricted; only files the user picks)
//   calendar -> calendar.readonly
// Always paired with the base openid/email/profile scopes.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

export type GoogleService = "mail" | "calendar" | "drive";

const BASE_SCOPES = ["openid", "email", "profile"];

const SERVICE_SCOPES: Record<GoogleService, string[]> = {
  mail: ["https://www.googleapis.com/auth/gmail.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.readonly"],
  drive: ["https://www.googleapis.com/auth/drive.file"],
};

/** Full scope list for a service, base scopes first. */
export function scopesForService(service: GoogleService): string[] {
  return [...BASE_SCOPES, ...SERVICE_SCOPES[service]];
}

export function isGoogleService(value: string): value is GoogleService {
  return value === "mail" || value === "calendar" || value === "drive";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function googleRedirectUri(): string {
  return `${siteUrl()}/api/oauth/google/callback`;
}

export function isGoogleOAuthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/**
 * Build the consent URL for the given scopes. include_granted_scopes makes this
 * incremental: if the user already granted other scopes on this Google account
 * (e.g. Gmail), Google keeps them and only asks for the new ones. login_hint
 * pre-selects the account so adding a service to an existing account is smooth.
 */
export function buildGoogleAuthUrl(input: {
  state: string;
  scopes: string[];
  loginHint?: string | null;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: input.scopes.join(" "),
    access_type: "offline",
    // consent guarantees a refresh token is returned even on re-grant.
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO
  scopes: string[];
};

function expiryIso(expiresInSeconds: number): string {
  return new Date(Date.now() + Math.max(0, expiresInSeconds - 30) * 1000).toISOString();
}

export async function exchangeCodeForGoogleTokens(
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: expiryIso(data.expires_in),
    scopes: data.scope ? data.scope.split(" ") : [],
  };
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: expiryIso(data.expires_in) };
}

/** Best-effort revoke at Google. Returns true on 2xx. */
export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchGooglePrimaryEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}
