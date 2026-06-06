"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { scopeFingerprint, type CacheScope } from "@/lib/swr/keys";

/**
 * Client cache layer (Round: perceived performance, Part 2). ONE SWR provider
 * wraps the authenticated dashboard. Stale-while-revalidate: cached data shows
 * instantly (keepPreviousData), revalidates in the background, refreshes on
 * focus/reconnect.
 *
 * CORRECTNESS:
 * - `provider: () => new Map()` ties the cache to this mount, so leaving the
 *   dashboard (logout) unmounts it and the cache is dropped — no cross-user leak.
 * - ScopeReset clears every entry the moment the user or active space changes,
 *   so a prior space/circle's data can never paint after a switch.
 * - Per-data keys are built via scopedKey/useScopedSWR (user + space + scope in
 *   every key), so a value is never served across a boundary in the first place.
 * Server-fetched data stays on Next's revalidate; this is only for client fetches.
 */

const ScopeCtx = createContext<CacheScope>({ userId: "anon", spaceId: "none" });

export function useCacheScope(): CacheScope {
  return useContext(ScopeCtx);
}

function ScopeReset({ scope }: { scope: CacheScope }) {
  const { mutate } = useSWRConfig();
  const fp = scopeFingerprint(scope);
  const prev = useRef(fp);
  useEffect(() => {
    if (prev.current === fp) return;
    prev.current = fp;
    // Drop every cached entry without revalidating the now-irrelevant ones.
    void mutate(() => true, undefined, { revalidate: false });
  }, [fp, mutate]);
  return null;
}

export function SwrProvider({
  userId,
  spaceId,
  children,
}: {
  userId: string;
  spaceId: string;
  children: ReactNode;
}) {
  const scope: CacheScope = { userId, spaceId };
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        dedupingInterval: 5000,
        focusThrottleInterval: 30_000,
        errorRetryCount: 2,
      }}
    >
      <ScopeCtx.Provider value={scope}>
        <ScopeReset scope={scope} />
        {children}
      </ScopeCtx.Provider>
    </SWRConfig>
  );
}
