import "server-only";

// WHOOP OAuth 2.0 helpers (API v2). Reads WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET
// from env; the redirect URI is derived from NEXT_PUBLIC_SITE_URL and must be
// registered in the WHOOP developer dashboard. Never logs tokens.
//
// IMPORTANT: WHOOP rotates the refresh token on every refresh. The token
// endpoint returns a NEW refresh_token alongside each new access_token, and the
// old one is invalidated. The caller MUST persist both (see connections.ts).

const AUTH_ENDPOINT = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN_ENDPOINT = "https://api.prod.whoop.com/oauth/oauth2/token";
const API_BASE = "https://api.prod.whoop.com/developer";

// read scopes for the data Oria surfaces, plus offline so WHOOP issues a
// refresh token. read:cycles is plural (WHOOP's spelling).
export const WHOOP_SCOPES = [
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:profile",
  "offline",
];

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(): string {
  return `${siteUrl()}/api/oauth/whoop/callback`;
}

export function isWhoopOAuthConfigured(): boolean {
  return !!process.env.WHOOP_CLIENT_ID && !!process.env.WHOOP_CLIENT_SECRET;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: WHOOP_SCOPES.join(" "),
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type WhoopTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO
  scopes: string[];
};

function expiryIso(expiresInSeconds: number): string {
  return new Date(Date.now() + Math.max(0, expiresInSeconds - 30) * 1000).toISOString();
}

export type TokenExchangeResult =
  | { ok: true; tokens: WhoopTokenResponse }
  | { ok: false; status: number; body: string };

/**
 * Exchange the authorization code for tokens. Returns a result rather than
 * throwing so the callback can log the precise failure (HTTP status + WHOOP's
 * error body, e.g. invalid_client on a stale secret, redirect_uri_mismatch).
 * The body is WHOOP's RESPONSE only and carries no secret. The redirect_uri here
 * is the same canonical redirectUri() used to build the authorize URL.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: process.env.WHOOP_CLIENT_ID ?? "",
        client_secret: process.env.WHOOP_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(),
      }),
    });
  } catch (e) {
    return { ok: false, status: 0, body: `network: ${(e as Error).message}` };
  }
  if (!res.ok) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      body = "";
    }
    return { ok: false, status: res.status, body };
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: expiryIso(data.expires_in),
      scopes: data.scope ? data.scope.split(" ") : WHOOP_SCOPES,
    },
  };
}

/**
 * Refresh an access token. WHOOP rotates the refresh token: the response
 * carries a fresh refresh_token that replaces the one we sent. We pass
 * scope=offline so WHOOP keeps issuing a refresh token on each rotation.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.WHOOP_CLIENT_ID ?? "",
      client_secret: process.env.WHOOP_CLIENT_SECRET ?? "",
      scope: "offline",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: expiryIso(data.expires_in),
  };
}

export type WhoopProfile = { whoopUserId: string; email: string | null };

export type ProfileFetchResult =
  | { ok: true; profile: WhoopProfile }
  | { ok: false; status: number; body: string };

/** Fetch the WHOOP profile. Returns a result so the callback can log a failed
 *  profile/scope fetch (e.g. a missing read:profile scope = 401/403). */
export async function fetchProfile(accessToken: string): Promise<ProfileFetchResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v2/user/profile/basic`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    return { ok: false, status: 0, body: `network: ${(e as Error).message}` };
  }
  if (!res.ok) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 200);
    } catch {
      body = "";
    }
    return { ok: false, status: res.status, body };
  }
  const data = (await res.json()) as { user_id?: number | string; email?: string };
  if (data.user_id === undefined || data.user_id === null) {
    return { ok: false, status: res.status, body: "no user_id in profile" };
  }
  return { ok: true, profile: { whoopUserId: String(data.user_id), email: data.email ?? null } };
}

/**
 * Best-effort revoke of the app's access for this user at WHOOP. Returns true
 * on a 2xx. Called on disconnect so the grant does not linger on WHOOP's side.
 */
export async function revokeAccess(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v2/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* --- typed data fetchers (v2 collections) -------------------------------- */

const PAGE_LIMIT = 25; // WHOOP max page size

export type WhoopRecovery = {
  cycle_id?: number;
  sleep_id?: string;
  created_at?: string;
  updated_at?: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
};

export type WhoopSleep = {
  id?: string;
  start?: string;
  end?: string;
  nap?: boolean;
  score?: {
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      total_awake_time_milli?: number;
    };
  };
};

export type WhoopCycle = {
  id?: number;
  start?: string;
  end?: string;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
};

/** Page through one v2 collection between two ISO instants. Caps total pages
 *  so a long-disconnected account can never spin the cron forever. */
async function pageCollection<T>(
  accessToken: string,
  path: string,
  startIso: string,
  endIso: string,
  maxPages = 8,
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      start: startIso,
      end: endIso,
    });
    if (nextToken) params.set("nextToken", nextToken);
    const res = await fetch(`${API_BASE}${path}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`WHOOP ${path} failed (${res.status})`);
    const data = (await res.json()) as { records?: T[]; next_token?: string | null };
    if (data.records?.length) out.push(...data.records);
    if (!data.next_token) break;
    nextToken = data.next_token;
  }
  return out;
}

export function fetchRecoveries(token: string, startIso: string, endIso: string) {
  return pageCollection<WhoopRecovery>(token, "/v2/recovery", startIso, endIso);
}
export function fetchSleeps(token: string, startIso: string, endIso: string) {
  return pageCollection<WhoopSleep>(token, "/v2/activity/sleep", startIso, endIso);
}
export function fetchCycles(token: string, startIso: string, endIso: string) {
  return pageCollection<WhoopCycle>(token, "/v2/cycle", startIso, endIso);
}
