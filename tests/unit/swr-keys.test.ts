import { describe, it, expect } from "vitest";
import { scopedKey, scopeFingerprint, SWR_NS } from "@/lib/swr/keys";

/**
 * The cache-leak guard: a scoped key MUST differ across users and across spaces,
 * and be stable for the same scope + resource. If this ever fails, cached data
 * could be served across a user/space/circle boundary, which is the one thing
 * Part 2 must never allow.
 */
describe("scopedKey", () => {
  const A = { userId: "user-a", spaceId: "space-1" };
  const B = { userId: "user-b", spaceId: "space-1" };
  const C = { userId: "user-a", spaceId: "space-2" };

  it("carries the namespace, user, and space ahead of the resource", () => {
    expect(scopedKey(A, "agenda")).toEqual([SWR_NS, "user-a", "space-1", "agenda"]);
  });

  it("differs across users (same space + resource)", () => {
    expect(scopedKey(A, "agenda")).not.toEqual(scopedKey(B, "agenda"));
  });

  it("differs across spaces (same user + resource)", () => {
    expect(scopedKey(A, "agenda")).not.toEqual(scopedKey(C, "agenda"));
  });

  it("is stable for the same scope + resource", () => {
    expect(scopedKey(A, "bills", 12)).toEqual(scopedKey({ ...A }, "bills", 12));
  });

  it("coerces a malformed scope so it can't collide with a real one", () => {
    expect(scopedKey({ userId: "", spaceId: "  " }, "x")).toEqual([SWR_NS, "anon", "none", "x"]);
    expect(scopeFingerprint({ userId: "", spaceId: "" })).toBe("anon:none");
  });

  it("fingerprint changes with user or space", () => {
    expect(scopeFingerprint(A)).not.toBe(scopeFingerprint(B));
    expect(scopeFingerprint(A)).not.toBe(scopeFingerprint(C));
  });
});
