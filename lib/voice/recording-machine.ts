/**
 * The voice-input affordance's state machine (Round 14.8 F4).
 *
 * Pure and framework-free so the recording lifecycle is unit-testable without a
 * DOM, a microphone, or React. The MicButton drives its UI from this reducer so
 * the tested transitions are the ones that actually ship.
 *
 *   idle ──START──▶ recording ──STOP──▶ transcribing ──TRANSCRIBED──▶ idle
 *                       │                      │
 *                     EMPTY                   FAIL──▶ error ──RESET──▶ idle
 *                       ▼
 *                      idle
 *
 * A FAIL from idle (microphone permission denied at start) also lands in error.
 */

export type RecordingState = "idle" | "recording" | "transcribing" | "error";

export type RecordingEvent =
  | { type: "START" } // user activates while idle
  | { type: "STOP" } // user activates while recording; audio goes to transcription
  | { type: "EMPTY" } // recording stopped but produced no audio
  | { type: "TRANSCRIBED" } // transcription returned
  | { type: "FAIL" } // mic access or transcription failed
  | { type: "RESET" }; // clear a transient error back to idle

export function nextRecordingState(state: RecordingState, event: RecordingEvent): RecordingState {
  switch (state) {
    case "idle":
      if (event.type === "START") return "recording";
      if (event.type === "FAIL") return "error";
      return state;
    case "recording":
      if (event.type === "STOP") return "transcribing";
      if (event.type === "EMPTY") return "idle";
      if (event.type === "FAIL") return "error";
      return state;
    case "transcribing":
      if (event.type === "TRANSCRIBED") return "idle";
      if (event.type === "FAIL") return "error";
      return state;
    case "error":
      if (event.type === "RESET") return "idle";
      return state;
    default:
      return state;
  }
}

/** The button is pressable only when idle (start) or recording (stop). */
export function canActivate(state: RecordingState): boolean {
  return state === "idle" || state === "recording";
}

/** True while audio is being transcribed (button shows a spinner, disabled). */
export function isBusy(state: RecordingState): boolean {
  return state === "transcribing";
}

/** ARIA pressed reflects the toggle: true only while actively recording. */
export function isPressed(state: RecordingState): boolean {
  return state === "recording";
}
