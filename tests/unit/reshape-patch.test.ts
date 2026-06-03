import { describe, it, expect } from "vitest";
import { sanitizePatch } from "@/lib/onboarding/reshape-plan";
import { patchIsEmpty } from "@/lib/onboarding/types";

const ORG = "11111111-1111-1111-1111-111111111111";
const SEC = "22222222-2222-2222-2222-222222222222";
const orgIds = new Set([ORG]);
const sectionIds = new Set([SEC]);

describe("sanitizePatch: reshape delete/rename safety", () => {
  it("keeps a delete that targets a known org", () => {
    const out = sanitizePatch(
      { deletes: [{ kind: "org", id: ORG, name: "Old Space" }] },
      orgIds,
      sectionIds,
    );
    expect(out.deletes).toEqual([{ kind: "org", id: ORG, name: "Old Space" }]);
  });

  it("drops a delete whose id is not a known org or section", () => {
    const out = sanitizePatch(
      { deletes: [{ kind: "org", id: "unknown-id", name: "Ghost" }] },
      orgIds,
      sectionIds,
    );
    expect(out.deletes).toEqual([]);
  });

  it("keeps a rename that targets a known section and trims the new name", () => {
    const out = sanitizePatch(
      { renames: [{ kind: "section", id: SEC, from: "Bills", to: "Expenses" }] },
      orgIds,
      sectionIds,
    );
    expect(out.renames).toEqual([
      { kind: "section", id: SEC, from: "Bills", to: "Expenses" },
    ]);
  });

  it("drops a rename with no target or empty new name", () => {
    const out = sanitizePatch(
      {
        renames: [
          { kind: "org", id: "nope", to: "X" },
          { kind: "org", id: ORG, to: "   " },
        ],
      },
      orgIds,
      sectionIds,
    );
    expect(out.renames).toEqual([]);
  });

  it("produces an empty patch when nothing valid is present", () => {
    const out = sanitizePatch(
      { deletes: [{ kind: "org", id: "x", name: "" }], renames: [] },
      orgIds,
      sectionIds,
    );
    expect(patchIsEmpty(out)).toBe(true);
  });
});
