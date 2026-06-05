import "server-only";

// Microsoft identity platform (Graph) OAuth 2.0 helpers. One Azure app
// registration (multi-tenant + personal accounts) covers Outlook mail, OneDrive
// files, and Outlook Calendar. The tenant is hardcoded to the configured
// MICROSOFT_OAUTH_TENANT (default "common"); only client id/secret come from
// env. Never logs tokens.
//
// Scope choices: openid email profile offline_access (offline_access is what
// yields a refresh token) plus the service-specific delegated scope.

const TENANT = process.env.MICROSOFT_OAUTH_TENANT || "common";
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const GRAPH_ME = "https://graph.microsoft.com/v1.0/me";

export type MicrosoftService = "mail" | "onedrive" | "calendar";

// Minimal delegated scopes. offline_access yields a refresh token; User.Read
// lets Graph /me resolve the account email. Kept lean to reduce the admin
// consent a managed (work/school) tenant would require.
const BASE_SCOPES = ["openid", "profile", "offline_access", "User.Read"];

const SERVICE_SCOPES: Record<MicrosoftService, string[]> = {
  mail: ["Mail.Read"],
  onedrive: ["Files.Read"],
  calendar: ["Calendars.Read"],
};

/** Client credentials. The deploy env sets MS_CLIENT_ID / MS_CLIENT_SECRET;
 *  the older MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET names still work so a
 *  rename can never silently unconfigure the connector (the WHOOP lesson). */
function msClientId(): string {
  return process.env.MS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID ?? "";
}
function msClientSecret(): string {
  return process.env.MS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET ?? "";
}

export function scopesForService(service: MicrosoftService): string[] {
  return [...BASE_SCOPES, ...SERVICE_SCOPES[service]];
}

export function isMicrosoftService(value: string): value is MicrosoftService {
  return value === "mail" || value === "onedrive" || value === "calendar";
}

/** The cloud_connections.service value for a Microsoft cloud service. */
export function cloudServiceFor(service: "onedrive" | "calendar"): "onedrive" | "outlook_calendar" {
  return service === "onedrive" ? "onedrive" : "outlook_calendar";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function microsoftRedirectUri(): string {
  return process.env.MICROSOFT_REDIRECT_URI || `${siteUrl()}/api/oauth/microsoft/callback`;
}

export function isMicrosoftOAuthConfigured(): boolean {
  return !!msClientId() && !!msClientSecret();
}

/**
 * Build the consent URL. Microsoft does incremental consent natively: asking
 * for a new service's scope on an account that already granted others prompts
 * only for the delta. login_hint pre-selects the account.
 */
export function buildMicrosoftAuthUrl(input: {
  state: string;
  scopes: string[];
  loginHint?: string | null;
}): string {
  const params = new URLSearchParams({
    client_id: msClientId(),
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: input.scopes.join(" "),
    prompt: "select_account",
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${AUTH_BASE}/authorize?${params.toString()}&state=${encodeURIComponent(input.state)}`;
}

export type MicrosoftTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO
  scopes: string[];
};

function expiryIso(expiresInSeconds: number): string {
  return new Date(Date.now() + Math.max(0, expiresInSeconds - 30) * 1000).toISOString();
}

async function tokenRequest(body: Record<string, string>): Promise<MicrosoftTokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: msClientId(),
      client_secret: msClientSecret(),
      redirect_uri: microsoftRedirectUri(),
      ...body,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      detail = "";
    }
    // Carry the status + Microsoft's response body (an AADSTS code, never a
    // secret) so the callback can log the precise token-exchange failure.
    throw new Error(`Microsoft token request failed (${res.status}): ${detail}`);
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

export async function exchangeCodeForMicrosoftTokens(
  code: string,
): Promise<MicrosoftTokenResponse> {
  return tokenRequest({ code, grant_type: "authorization_code" });
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string; refreshToken: string | null }> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return { accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken };
}

/** Resolve the account's primary email from Graph /me. */
export async function fetchMicrosoftPrimaryEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GRAPH_ME, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return data.mail ?? data.userPrincipalName ?? null;
  } catch {
    return null;
  }
}
