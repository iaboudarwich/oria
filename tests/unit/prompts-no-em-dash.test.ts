import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Em-dash regression test (deterministic stand-in for a manual sample run).
 *
 * The Ask Oria / Work AI / onboarding agents had been emitting em-dashes
 * (U+2014) in responses because their own system prompts were full of
 * them. The model was mimicking. We rewrote the prompts to be em-dash
 * free and added a strict rule banning the character; this test makes
 * sure the prompts STAY clean. If a future edit re-introduces a `—` in
 * any lib/ai/*.ts file, the test fails with a pointer to the line.
 *
 * Why every file in lib/ai (not just *system prompts*):
 *   * Schema description strings (extraction-schemas.ts) are sent to
 *     Claude as part of tool definitions; the model treats them the
 *     same way it treats prompt prose.
 *   * Tool descriptions in extract.ts / work-report.ts have the same
 *     reach.
 *   * Comment-only em-dashes don't affect output, but a single, simple
 *     "no em-dashes anywhere in lib/ai" rule is easier to enforce and
 *     leaves no room for re-introduction by accident.
 *
 * Components that genuinely need to MATCH em-dashes in user data (the
 * calendar title parser uses `[—–\-]` in a regex character class) live
 * outside lib/ai and are not covered here.
 */

const EM_DASH = "—"; // The forbidden character.
const AI_DIR = join(process.cwd(), "lib", "ai");

function listAiFiles(): string[] {
  return readdirSync(AI_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(AI_DIR, name));
}

describe("AI prompts must contain zero em-dashes", () => {
  const files = listAiFiles();

  it("found AI prompt files to check (sanity)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${file.split("/").slice(-2).join("/")} has no em-dash`, () => {
      const text = readFileSync(file, "utf8");
      const hits: Array<{ line: number; col: number; preview: string }> = [];
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        const idx = line.indexOf(EM_DASH);
        if (idx !== -1) {
          const start = Math.max(0, idx - 20);
          const end = Math.min(line.length, idx + 21);
          hits.push({
            line: i + 1,
            col: idx + 1,
            preview: line.slice(start, end),
          });
        }
      });
      if (hits.length > 0) {
        const message =
          `Found ${hits.length} em-dash(es) in ${file}:\n` +
          hits
            .map((h) => `  line ${h.line} col ${h.col}: …${h.preview}…`)
            .join("\n") +
          `\n\nReplace each one with a comma, a period, or a rewrite. ` +
          `The Ask Oria agent will mirror em-dashes back at users if they appear in the prompt body.`;
        throw new Error(message);
      }
      expect(hits).toEqual([]);
    });
  }
});

describe("User-facing AI greeting strings are em-dash free", () => {
  // Spot-check the onboarding conversation question bank. These base
  // questions are the very first thing a user sees from Oria.
  it("onboarding question bank base strings", async () => {
    const bank = (await import("@/lib/onboarding/question-bank.json"))
      .default as Record<
      string,
      Array<{ base: string; options?: string[] }>
    >;
    for (const questions of Object.values(bank)) {
      for (const q of questions) {
        expect(q.base).not.toContain(EM_DASH);
        for (const opt of q.options ?? []) {
          expect(opt).not.toContain(EM_DASH);
        }
      }
    }
  });
});
