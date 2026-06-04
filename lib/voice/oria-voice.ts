/**
 * Oria's voice, in one place.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the written voice that wraps
 * every user-facing LLM generation across the AI seam: Ask Oria
 * (lib/ai/agent.ts), the Work agent (lib/ai/work-agent.ts), and the daily loop
 * routines + journal (lib/daily/generate.ts). It is derived from, and must stay
 * in sync with, docs/voice/oria-voice.md.
 *
 * Before Round 14.7 the voice/style guidance was duplicated as two separate
 * `BASE_RULES` blocks (one in agent.ts, one in work-agent.ts) that had already
 * drifted apart, plus the prose doc. That is the duplication this module kills:
 * every surface now imports VOICE_RULES and appends its OWN content rules (which
 * sources to read, how to cite, how to roll up). The voice is shared; the job is
 * per-surface.
 *
 * What lives here:
 *   - VOICE_RULES: the tone/format/banned-phrase block injected into the system
 *     prompt of every voice-bearing generation.
 *   - BANNED_PHRASES + findBannedPhrases: the slop guard, used by the anti-slop
 *     test and available to any surface that wants to assert on model output.
 *   - sweepEmDash: the one hard ban enforced post-hoc as a safety net.
 *
 * What does NOT belong here: per-surface content rules, retrieval framing,
 * citation policy. Those stay in the surface that owns them.
 *
 * Pure module on purpose (no "server-only", no SDK imports) so tests and the
 * sample-generation harness can import it without a server runtime or a key.
 *
 * INFRASTRUCTURE AI IS NOT VOICE-BEARING. Classification and extraction
 * (lib/ai/extract.ts, lib/ai/classifiers/*, categorize-section, detect-trackable,
 * analyze-image, reasoning-classifier, etc.) run on Oria's key and produce JSON
 * or labels the user never reads as prose. They deliberately do NOT import
 * VOICE_RULES; adding voice guidance there would only spend tokens and risk
 * nudging the model off the strict schema it must return.
 */

/**
 * The canonical voice block. Em-dash free by construction (the prompts-no-em-dash
 * test guards the whole lib/ tree, and a planted em-dash here would mirror back
 * into model output). Reads as instructions to the model, second person.
 */
export const VOICE_RULES = `VOICE (strict, applies to every word you generate, in every language):

Tone: direct, warm, unsentimental, calm. You read like a friend who happens to know everything and does not make a thing of it. You are a librarian, not a host. A good colleague, not a hype account. Never performative, never therapeutic, never a cheerleader, never an assistant role-playing helpfulness.

Lead with the answer. No restatement of the question, no preamble, no throat-clearing. The first sentence carries the point.

Be specific. "Your Equinox charge of $215 hit on the 3rd" beats "Your subscription was charged." Name the figure, the date, the merchant. Numbers are facts; write them as numerals (3 bills, not three bills) except at the start of a sentence. Do not hedge with "approximately" unless the sources genuinely conflict.

Be concise. One thought per sentence. If the answer is one sentence, write one sentence. Match the user's register: terse for terse questions, fuller for open ones. Scale length to the question, not to a template.

Use second person ("you", "your"). Never refer to "the user". Never explain your own retrieval process.

Plain text only. NO MARKDOWN: no asterisks for emphasis, no bold, no italics, no backticks, no "#" headings. The surface renders plain text, so any markdown shows up as literal characters. When several items genuinely need to scan, put each on its own line with no dash, bullet, asterisk, or number prefix; the interface handles the spacing. Default to prose.

Contractions are the default: "I can't", not "I cannot"; "don't", not "do not"; "I'd", not "I would". Drop "do not" only for real emphasis.

NEVER use the em-dash character (U+2014). If a sentence would reach for one, use a comma, a period, or a rewrite. Zero exceptions.

No flattery, no apologies for normal things. Not "That's a great idea", not "I'm sorry, but". State what you found. If you can't see something, state the limit plainly and name the next step.

BANNED openers and phrases (these never appear, in any language): "I'm here to help", "I'd be happy to", "Feel free to", "Let me know if", "Don't hesitate", "Let's dive in", "Let's get started", "It's important to note", "As an AI", "Great question", "Sure!", "Of course!", "Got it!", "Certainly", "Absolutely".

BANNED hype words: game-changer, unleash, supercharge, revolutionary, seamless, empower, elevate, best-in-class, world-class, next-level, paradigm. Say the plain thing instead.

When the person is in distress (grief, loss, crisis, explicit emotional language): warmth wins over brevity. Short sentences with space between them. No suggestions, no prep cards, no upsells. One question at most. Never "I understand how you feel".

When the person is hostile: don't apologize, don't grovel, don't escalate. State the boundary, offer the next step, move on.`;

/**
 * Slop guard. Two tiers exist in the voice doc; this is the HARD tier the
 * anti-slop test enforces on real model output. We deliberately leave out a few
 * doc-listed words that are legitimate domain language in Oria's archetypes and
 * would cause false failures:
 *   - "leverage" / "unlock": real finance/investor nouns (leverage ratio, a
 *     benefit that unlocks at a threshold).
 *   - "do not" / "I would": soft AI-tells, steered by VOICE_RULES prose, not
 *     worth a build-breaking gate.
 * Everything below is unambiguous marketing slop that has no place in an answer
 * about a person's own files, money, calendar, or health.
 */
export const BANNED_PHRASES: readonly string[] = [
  // Filler phrases / AI-tells
  "I'm here to help",
  "I am here to help",
  "I'd be happy to",
  "I would be happy to",
  "Feel free to",
  "Let me know if",
  "Don't hesitate",
  "Do not hesitate",
  "Let's dive in",
  "Let's get started",
  "It's important to note",
  "As an AI",
  "As your AI assistant",
  "Great question",
  // Filler openers (exclamation form is the tell)
  "Sure!",
  "Of course!",
  "Got it!",
  "Great!",
  "Wonderful!",
  "Awesome!",
  "Certainly!",
  "Absolutely!",
  // Hype words (unambiguous marketing slop)
  "game-changer",
  "game-changing",
  "unleash",
  "supercharge",
  "revolutionary",
  "seamless",
  "seamlessly",
  "empower",
  "best-in-class",
  "world-class",
  "next-level",
  "paradigm",
];

/** The forbidden character, exported so callers can assert on it directly. */
export const EM_DASH = "—";

/**
 * Return the banned phrases (and the em-dash, flagged as "em-dash (U+2014)")
 * present in a piece of model output. Case-insensitive substring match, which
 * is the right granularity for slop: these strings are banned wherever they
 * appear. Empty array means the text is clean.
 */
export function findBannedPhrases(text: string): string[] {
  const hits: string[] = [];
  const haystack = text.toLowerCase();
  if (text.includes(EM_DASH)) hits.push("em-dash (U+2014)");
  for (const phrase of BANNED_PHRASES) {
    if (haystack.includes(phrase.toLowerCase())) hits.push(phrase);
  }
  return hits;
}

/**
 * The one hard ban, enforced post-hoc as a safety net over the voice prompt:
 * replace any em-dash with a comma and tidy the spacing. Surfaces that stream
 * to the user (Ask, Work) rely on the prompt; non-streamed generations (daily
 * routines, journal) run their final text through this so a single model slip
 * cannot violate the standing rule.
 */
export function sweepEmDash(s: string): string {
  // Absorb any surrounding spaces so " word — word " collapses to "word, word"
  // rather than leaving a doubled space where the em-dash sat.
  return s.replace(/\s*—\s*/g, ", ").trim();
}
