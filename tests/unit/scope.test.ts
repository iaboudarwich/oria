import { describe, it, expect, vi, beforeEach } from "vitest";

// recordSystemEvent uses the admin Supabase client + server-only.
// Mocked at the module boundary so the helper under test stays pure
// and we can assert *whether* a scope violation was logged.
//
// vi.hoisted is required because vi.mock is hoisted above import
// statements; without it, the inline factory captures `undefined`.
const { recordSystemEvent } = vi.hoisted(() => ({
  recordSystemEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/data/system-events", () => ({
  recordSystemEvent,
}));

import {
  enforceActiveOrg,
  enforceAllowedOrgs,
  requireActiveOrgId,
} from "@/lib/data/scope";

const ACTIVE = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  recordSystemEvent.mockClear();
});

describe("enforceActiveOrg", () => {
  it("keeps rows whose organization_id matches the active org", () => {
    const rows = [
      { organization_id: ACTIVE, n: 1 },
      { organization_id: ACTIVE, n: 2 },
    ];
    const out = enforceActiveOrg(rows, ACTIVE, "test.match");
    expect(out).toEqual(rows);
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });

  it("drops rows from a different org and logs a scope.violation", () => {
    const rows = [
      { organization_id: ACTIVE, n: 1 },
      { organization_id: OTHER, n: 2 },
      { organization_id: ACTIVE, n: 3 },
    ];
    const out = enforceActiveOrg(rows, ACTIVE, "test.leak");
    expect(out).toEqual([
      { organization_id: ACTIVE, n: 1 },
      { organization_id: ACTIVE, n: 3 },
    ]);
    expect(recordSystemEvent).toHaveBeenCalledTimes(1);
    const call = recordSystemEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(call.kind).toBe("scope.violation");
    expect(call.severity).toBe("error");
    expect(call.organizationId).toBe(ACTIVE);
    expect((call.context as Record<string, unknown>).callSite).toBe("test.leak");
    expect((call.context as Record<string, unknown>).droppedCount).toBe(1);
  });

  it("fails closed when expectedOrgId is empty", () => {
    const rows = [{ organization_id: ACTIVE, n: 1 }];
    expect(enforceActiveOrg(rows, "", "test.empty")).toEqual([]);
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });

  it("drops rows with null organization_id", () => {
    const rows = [
      { organization_id: ACTIVE, n: 1 },
      { organization_id: null, n: 2 },
      { organization_id: undefined, n: 3 },
    ];
    const out = enforceActiveOrg(rows, ACTIVE, "test.null");
    expect(out).toEqual([{ organization_id: ACTIVE, n: 1 }]);
    expect(recordSystemEvent).toHaveBeenCalledTimes(1);
  });
});

describe("enforceAllowedOrgs (God's Eye)", () => {
  it("keeps rows in the allowed set", () => {
    const rows = [
      { organization_id: ACTIVE, n: 1 },
      { organization_id: OTHER, n: 2 },
    ];
    const out = enforceAllowedOrgs(rows, new Set([ACTIVE, OTHER]), "test.cross");
    expect(out).toEqual(rows);
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });

  it("drops rows outside the allowed set and logs", () => {
    const rows = [
      { organization_id: ACTIVE, n: 1 },
      { organization_id: OTHER, n: 2 },
    ];
    const out = enforceAllowedOrgs(rows, new Set([ACTIVE]), "test.leak.cross");
    expect(out).toEqual([{ organization_id: ACTIVE, n: 1 }]);
    expect(recordSystemEvent).toHaveBeenCalledTimes(1);
  });

  it("fails closed on an empty allow-list", () => {
    const rows = [{ organization_id: ACTIVE }];
    expect(enforceAllowedOrgs(rows, new Set<string>(), "test.empty")).toEqual([]);
    expect(recordSystemEvent).not.toHaveBeenCalled();
  });
});

describe("requireActiveOrgId", () => {
  it("returns the active org id", () => {
    const ctx = { organization: { id: ACTIVE } };
    expect(requireActiveOrgId(ctx)).toBe(ACTIVE);
  });

  it("throws when ctx is null", () => {
    expect(() => requireActiveOrgId(null)).toThrowError(
      /no active organization/,
    );
  });

  it("throws when organization.id is null", () => {
    expect(() => requireActiveOrgId({ organization: { id: null } })).toThrow();
  });

  it("throws when organization is missing", () => {
    expect(() => requireActiveOrgId({ organization: null })).toThrow();
  });
});
