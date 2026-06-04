import { describe, it, expect } from "vitest";
import { resolveAutoGrow } from "@/components/ui/auto-grow-textarea";

/**
 * The composer must show input immediately and grow with content up to a max,
 * then scroll. resolveAutoGrow is the pure height policy behind that.
 */
describe("resolveAutoGrow", () => {
  it("grows to fit content under the max (no scroll)", () => {
    expect(resolveAutoGrow(40, 200)).toEqual({ heightPx: 40, overflow: false });
    expect(resolveAutoGrow(120, 200)).toEqual({ heightPx: 120, overflow: false });
  });

  it("caps at the max and scrolls once content exceeds it", () => {
    expect(resolveAutoGrow(260, 200)).toEqual({ heightPx: 200, overflow: true });
  });

  it("sits exactly at the max without scrolling at the boundary", () => {
    expect(resolveAutoGrow(200, 200)).toEqual({ heightPx: 200, overflow: false });
  });
});
