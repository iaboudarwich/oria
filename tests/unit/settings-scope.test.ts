import { describe, it, expect } from "vitest";
import { scopeKindOf, resolveEditingScopeId } from "@/lib/settings/scope";

describe("settings scope", () => {
  it("maps org kind to scope kind", () => {
    expect(scopeKindOf({ kind: "personal" })).toBe("personal");
    expect(scopeKindOf({ kind: "office" })).toBe("work");
    expect(scopeKindOf({ kind: "circle" })).toBe("circle");
    expect(scopeKindOf({ kind: null })).toBe("personal");
  });

  it("uses a valid scope param when the user is a member", () => {
    expect(resolveEditingScopeId("b", ["a", "b", "c"], "a")).toBe("b");
  });

  it("falls back to the active org for a stale or absent param", () => {
    expect(resolveEditingScopeId("zzz", ["a", "b"], "a")).toBe("a");
    expect(resolveEditingScopeId(null, ["a", "b"], "b")).toBe("b");
    expect(resolveEditingScopeId(undefined, ["a", "b"], "a")).toBe("a");
  });

  it("falls back to the first space when there is no active org", () => {
    expect(resolveEditingScopeId(null, ["a", "b"], null)).toBe("a");
    expect(resolveEditingScopeId(null, [], null)).toBeNull();
  });
});
