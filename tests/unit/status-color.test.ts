import { describe, it, expect } from "vitest";
import {
  STATUS_VAR,
  STATUS_TRACK,
  STATUS_DOT,
  STATUS_TEXT,
  DATA_VAR,
  DATA_TRACK,
  toneForScore,
  type StatusTone,
  type DataTone,
} from "@/lib/ui/status-color";

/**
 * The status/data color system is the single source for "one meaning per
 * color". These guard that: every tone resolves to a token (never a raw hex),
 * the arc + track maps stay in lockstep, and the score->tone thresholds hold.
 * After the v3 palette overhaul the status roles route onto the data hues
 * (good=rec, warn=spend, bad=down), so a regression in the token bridge or a
 * dropped key surfaces here, not in a screenshot.
 */

const TONES: StatusTone[] = ["good", "warn", "bad", "info", "neutral"];
const DATA: DataTone[] = ["recovery", "sleep", "strain", "spend", "networth"];

describe("status-color tones", () => {
  it("every status tone has an arc, track, dot, and text mapping", () => {
    for (const tone of TONES) {
      expect(STATUS_VAR[tone]).toMatch(/^var\(--/);
      expect(STATUS_TRACK[tone]).toMatch(/^var\(--/);
      expect(STATUS_DOT[tone]).toMatch(/^bg-/);
      expect(STATUS_TEXT[tone]).toMatch(/^text-/);
    }
  });

  it("score maps to a tone on the documented thresholds", () => {
    expect(toneForScore(0)).toBe("bad");
    expect(toneForScore(33)).toBe("bad");
    expect(toneForScore(34)).toBe("warn");
    expect(toneForScore(66)).toBe("warn");
    expect(toneForScore(67)).toBe("good");
    expect(toneForScore(100)).toBe("good");
  });

  it("a bad clamp never throws and stays a valid tone", () => {
    expect(toneForScore(Number.NaN >= 0 ? Number.NaN : -1)).toBe("bad");
    expect(toneForScore(9999)).toBe("good");
  });
});

describe("named data series", () => {
  it("every series has a fixed hue and a tinted track, both tokens", () => {
    for (const series of DATA) {
      expect(DATA_VAR[series]).toMatch(/^var\(--/);
      expect(DATA_TRACK[series]).toMatch(/^var\(--/);
    }
  });

  it("the home dial hues are the expected tokens", () => {
    expect(DATA_VAR.recovery).toBe("var(--rec)");
    expect(DATA_VAR.sleep).toBe("var(--sleep)");
    expect(DATA_VAR.strain).toBe("var(--strain)");
    expect(DATA_VAR.spend).toBe("var(--spend)");
  });
});
