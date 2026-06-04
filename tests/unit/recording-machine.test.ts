import { describe, it, expect } from "vitest";
import {
  nextRecordingState,
  canActivate,
  isBusy,
  isPressed,
  type RecordingState,
} from "@/lib/voice/recording-machine";

/**
 * F4 voice-input state handling (Round 14.8). Locks the transitions the mic
 * affordance ships with so a refactor can't silently strand it in (say)
 * "transcribing" or make it pressable mid-upload.
 */

describe("nextRecordingState", () => {
  it("runs the happy path idle -> recording -> transcribing -> idle", () => {
    let s: RecordingState = "idle";
    s = nextRecordingState(s, { type: "START" });
    expect(s).toBe("recording");
    s = nextRecordingState(s, { type: "STOP" });
    expect(s).toBe("transcribing");
    s = nextRecordingState(s, { type: "TRANSCRIBED" });
    expect(s).toBe("idle");
  });

  it("returns to idle when a recording produced no audio", () => {
    expect(nextRecordingState("recording", { type: "EMPTY" })).toBe("idle");
  });

  it("lands in error on mic-start failure and on transcription failure", () => {
    expect(nextRecordingState("idle", { type: "FAIL" })).toBe("error");
    expect(nextRecordingState("recording", { type: "FAIL" })).toBe("error");
    expect(nextRecordingState("transcribing", { type: "FAIL" })).toBe("error");
  });

  it("clears an error back to idle on RESET", () => {
    expect(nextRecordingState("error", { type: "RESET" })).toBe("idle");
  });

  it("ignores events that don't apply to the current state", () => {
    expect(nextRecordingState("idle", { type: "STOP" })).toBe("idle");
    expect(nextRecordingState("transcribing", { type: "START" })).toBe("transcribing");
    expect(nextRecordingState("recording", { type: "TRANSCRIBED" })).toBe("recording");
    expect(nextRecordingState("error", { type: "START" })).toBe("error");
  });
});

describe("derived helpers", () => {
  it("canActivate only while idle or recording", () => {
    expect(canActivate("idle")).toBe(true);
    expect(canActivate("recording")).toBe(true);
    expect(canActivate("transcribing")).toBe(false);
    expect(canActivate("error")).toBe(false);
  });

  it("isBusy only while transcribing", () => {
    expect(isBusy("transcribing")).toBe(true);
    expect(isBusy("recording")).toBe(false);
  });

  it("isPressed only while recording", () => {
    expect(isPressed("recording")).toBe(true);
    expect(isPressed("idle")).toBe(false);
    expect(isPressed("transcribing")).toBe(false);
  });
});
