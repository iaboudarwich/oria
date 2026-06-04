import { describe, it, expect } from "vitest";
import { dedupeSidebarSections } from "@/lib/sidebar/dedupe-sections";

/**
 * The personal template seeds custom sections named "Bills", "Health",
 * "Travel", "Personal" that shadow the smart Bills page and the built-in
 * sections, so the same name rendered twice in the rail. Dedupe keeps the
 * canonical entry (smart > builtin > review > custom) and drops the duplicate.
 */
describe("dedupeSidebarSections", () => {
  it("drops a custom that shadows the smart Bills (keeps smart)", () => {
    const out = dedupeSidebarSections([
      { label: "Bills", kind: "smart", href: "/dashboard/bills" },
      { label: "Bills", kind: "custom", href: "/dashboard/sections/x" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("smart");
  });

  it("drops a custom that shadows a built-in (keeps built-in), case-insensitively", () => {
    const out = dedupeSidebarSections([
      { label: "Health", kind: "builtin", href: "/dashboard/sections/health" },
      { label: "health", kind: "custom", href: "/dashboard/sections/y" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("builtin");
  });

  it("keeps the canonical even when the custom appears first", () => {
    const out = dedupeSidebarSections([
      { label: "Travel", kind: "custom", href: "/dashboard/sections/z" },
      { label: "Travel", kind: "builtin", href: "/dashboard/sections/travel" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("builtin");
  });

  it("keeps custom sections with unique names", () => {
    const out = dedupeSidebarSections([
      { label: "Bills", kind: "smart", href: "/dashboard/bills" },
      { label: "Insurance", kind: "custom", href: "/dashboard/sections/a" },
      { label: "Investments", kind: "custom", href: "/dashboard/sections/b" },
    ]);
    expect(out.map((s) => s.label)).toEqual(["Bills", "Insurance", "Investments"]);
  });

  it("preserves the order of the surviving entries", () => {
    const out = dedupeSidebarSections([
      { label: "Bills", kind: "smart", href: "/b" },
      { label: "Unsorted", kind: "review", href: "/r" },
      { label: "Health", kind: "builtin", href: "/h" },
      { label: "Health", kind: "custom", href: "/hc" },
      { label: "Travel", kind: "builtin", href: "/t" },
    ]);
    expect(out.map((s) => s.label)).toEqual(["Bills", "Unsorted", "Health", "Travel"]);
  });
});
