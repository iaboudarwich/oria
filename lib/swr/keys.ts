/**
 * SWR cache-key SCOPING (Round: perceived performance, Part 2). The correctness
 * rule: any client cache key for user/space-scoped data MUST carry the user id
 * AND the active space id, so a cached value can NEVER be served across users,
 * spaces, or circles. Build every such key through `scopedKey` (or the
 * `useScopedSWR` hook) instead of a hand-written string, and the leak is
 * impossible by construction. Pure module, unit-tested.
 *
 * App-GLOBAL data with no per-user/space dimension (e.g. the deploy version)
 * uses a plain key and deliberately skips this.
 */

export const SWR_NS = "oria/v1";

export type CacheScope = { userId: string; spaceId: string };

/**
 * A namespaced, user+space-scoped SWR key. Returns a tuple key (SWR supports
 * array keys); the leading parts guarantee isolation, the rest identify the
 * resource. Empty/whitespace ids are coerced to "anon"/"none" so a malformed
 * scope still can't collide with a real one.
 */
export function scopedKey(
  scope: CacheScope,
  ...parts: Array<string | number>
): [string, string, string, ...Array<string | number>] {
  const user = scope.userId?.trim() || "anon";
  const space = scope.spaceId?.trim() || "none";
  return [SWR_NS, user, space, ...parts];
}

/** A stable fingerprint of a scope, for "clear the cache when the scope changes". */
export function scopeFingerprint(scope: CacheScope): string {
  return `${scope.userId?.trim() || "anon"}:${scope.spaceId?.trim() || "none"}`;
}
