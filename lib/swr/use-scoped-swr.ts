"use client";

import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";
import { useCacheScope } from "@/components/providers/swr-provider";
import { scopedKey } from "@/lib/swr/keys";

/**
 * The STANDARD way to client-cache user/space-scoped data. It pulls the active
 * scope (user + space) from the provider and builds the key via scopedKey, so a
 * caller can never forget the scope and leak data across users/spaces/circles.
 *
 * `parts` identify the resource (e.g. ["agenda"] or ["bills", 12]); pass null to
 * disable the request. The fetcher receives the full scoped key. Seed the first
 * render with server data via `opts.fallbackData` to avoid a fetch + flash, then
 * SWR revalidates in the background. Invalidate after a mutation by calling
 * `mutate(scopedKey(scope, ...parts))` (or the global `mutate`) from the caller.
 */
export function useScopedSWR<T>(
  parts: Array<string | number> | null,
  fetcher: (key: Array<string | number>) => Promise<T>,
  opts?: SWRConfiguration<T> & { refreshMs?: number },
): SWRResponse<T> {
  const scope = useCacheScope();
  const key = parts ? scopedKey(scope, ...parts) : null;
  const { refreshMs, ...rest } = opts ?? {};
  return useSWR<T>(key, key ? () => fetcher(key) : null, {
    refreshInterval: refreshMs,
    ...rest,
  });
}
