import { describe, it, expect } from "vitest";
import { deviceLabelFromUA } from "@/lib/auth/trusted-device";

/** The trusted-devices list shows a friendly label per device; this is the
 *  pure parser behind it. */
describe("deviceLabelFromUA", () => {
  it("names Chrome on Mac", () => {
    expect(
      deviceLabelFromUA(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      ),
    ).toBe("Chrome on Mac");
  });

  it("names Safari on iOS", () => {
    expect(
      deviceLabelFromUA(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iOS");
  });

  it("detects Edge over Chrome (Edg/ token wins)", () => {
    expect(
      deviceLabelFromUA(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("names Firefox on Linux", () => {
    expect(
      deviceLabelFromUA("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0"),
    ).toBe("Firefox on Linux");
  });

  it("names Chrome on Android", () => {
    expect(
      deviceLabelFromUA(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome on Android");
  });

  it("falls back gracefully on an empty/unknown agent", () => {
    expect(deviceLabelFromUA(null)).toBe("Browser on device");
    expect(deviceLabelFromUA("")).toBe("Browser on device");
  });
});
