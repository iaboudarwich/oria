import "server-only";

import { getFreshMicrosoftCloudToken } from "./token-refresh";

const GRAPH = "https://graph.microsoft.com/v1.0";

export type OneDriveItem = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string | null;
  webUrl: string | null;
  size: number | null;
};

export type BrowseResult =
  | { ok: true; items: OneDriveItem[] }
  | { ok: false; reason: "token" | "error" };

/**
 * List the children of a OneDrive folder (root when folderId is null), so the
 * custom picker can browse. Uses the connection's token server-side; the token
 * is never exposed to the browser.
 */
export async function browseOneDrive(
  connectionId: string,
  folderId: string | null,
): Promise<BrowseResult> {
  const token = await getFreshMicrosoftCloudToken(connectionId);
  if (!token) return { ok: false, reason: "token" };
  const path = folderId
    ? `${GRAPH}/me/drive/items/${encodeURIComponent(folderId)}/children`
    : `${GRAPH}/me/drive/root/children`;
  const url = `${path}?$select=id,name,size,webUrl,folder,file&$top=200`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, reason: "error" };
    const data = (await res.json()) as {
      value?: Array<{
        id: string;
        name: string;
        size?: number;
        webUrl?: string;
        folder?: unknown;
        file?: { mimeType?: string };
      }>;
    };
    const items = (data.value ?? []).map((it) => ({
      id: it.id,
      name: it.name,
      isFolder: !!it.folder,
      mimeType: it.file?.mimeType ?? null,
      webUrl: it.webUrl ?? null,
      size: typeof it.size === "number" ? it.size : null,
    }));
    return { ok: true, items };
  } catch {
    return { ok: false, reason: "error" };
  }
}
