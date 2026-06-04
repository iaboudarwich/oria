/**
 * Round 14.7 voice sample generator + live verifier.
 *
 * Generates 20 Ask-style samples across query types and the launch archetypes
 * (Personal / Investor / Business / Family Office), through the LIVE providers
 * whose keys are present in .env.local, using the canonical VOICE_RULES
 * (lib/voice/oria-voice.ts) as the single source of voice. For each sample it:
 *   - runs every available provider on the SAME system prompt + question,
 *   - checks the output for banned phrases (live anti-slop),
 *   - records both outputs side by side (live cross-provider parity),
 * and writes a human-reviewable docs/voice/round-14_7-samples.md plus a short
 * stdout summary. Providers with no key are flagged, never faked.
 *
 * This is a verification harness, not application code: it calls the provider
 * SDKs directly (the seam in lib/ai-providers governs pages/routes, not a
 * one-off script) but pulls voice from the same VOICE_RULES every surface uses,
 * so what it shows is the voice users actually get.
 *
 * Run: npx tsx scripts/voice-samples.mts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { VOICE_RULES, findBannedPhrases } from "../lib/voice/oria-voice.ts";
import { modelFor } from "../lib/ai-providers/model-map.ts";

try {
  process.loadEnvFile(join(process.cwd(), ".env.local"));
} catch {
  // env may already be in process.env (CI); carry on.
}

// A faithful, self-contained Ask framing: the same VOICE_RULES every surface
// injects, wrapped in a minimal Ask role + the source-grounding rule. Kept
// short on purpose so the sample reflects the VOICE, which is what review is for.
const ASK_FRAMING = `You are Oria, a private assistant that helps one person act on what is in their own files, reminders, and calendar. Answer strictly from the SOURCES block in the question. Cite a [id] only if the person asks for sources or proof. If the sources do not cover the question, say so plainly and name what to add. Answer in the language the person used.`;

const SYSTEM = `${ASK_FRAMING}\n\n${VOICE_RULES}`;

type Sample = {
  n: number;
  archetype: "Personal" | "Investor" | "Business" | "Family Office";
  type: string;
  lang: string;
  question: string;
  sources: string;
};

const SAMPLES: Sample[] = [
  {
    n: 1,
    archetype: "Personal",
    type: "single lookup",
    lang: "en",
    question: "When does my passport expire?",
    sources: `[1] Record: "US Passport" · Documents · expires 2028-09-14, issued 2018-09-15`,
  },
  {
    n: 2,
    archetype: "Personal",
    type: "roll-up",
    lang: "en",
    question: "How much did I spend on groceries this month?",
    sources: `[1] Whole Foods receipt · 2026-06-02 · $84.20
[2] Trader Joe's receipt · 2026-06-09 · $61.75
[3] Whole Foods receipt · 2026-06-17 · $112.40
[4] Costco receipt · 2026-06-24 · $208.10 (groceries + household)`,
  },
  {
    n: 3,
    archetype: "Personal",
    type: "what's coming up",
    lang: "en",
    question: "What's on this week?",
    sources: `[1] Calendar: Dentist, Thu 2026-06-11 14:00
[2] Reminder: Car registration renews 2026-06-13
[3] Calendar: Dinner with Priya, Fri 2026-06-12 19:30`,
  },
  {
    n: 4,
    archetype: "Personal",
    type: "honest limit (no source)",
    lang: "en",
    question: "How much did I spend on gas this month?",
    sources: `(no sources matched the question)`,
  },
  {
    n: 5,
    archetype: "Personal",
    type: "distress",
    lang: "en",
    question: "my dad died this morning. i can't deal with any of this right now.",
    sources: `[1] Reminder: Call accountant about Q2 (due today)`,
  },
  {
    n: 6,
    archetype: "Investor",
    type: "single lookup",
    lang: "en",
    question: "What's the carried interest on Fund III?",
    sources: `[1] Record: "Fund III LPA" · carried interest 20% over an 8% preferred return`,
  },
  {
    n: 7,
    archetype: "Investor",
    type: "roll-up",
    lang: "en",
    question: "How much of my portfolio is in AI startups?",
    sources: `[1] Holding: Anthropic, $250,000, sector AI
[2] Holding: Cursor, $120,000, sector AI
[3] Holding: Ramp, $90,000, sector fintech
[4] Holding: Whoop, $60,000, sector health`,
  },
  {
    n: 8,
    archetype: "Investor",
    type: "what to review",
    lang: "en",
    question: "Anything that needs attention on my deals?",
    sources: `[1] Deal: Helix Bio, in diligence, data room access expires 2026-06-12
[2] Deal: Northwind, SAFE signature requested, awaiting countersign 6 days
[3] Deal: Lumen, term sheet sent, no response 11 days`,
  },
  {
    n: 9,
    archetype: "Investor",
    type: "hostile",
    lang: "en",
    question: "this is useless. stop wasting my time and just give me the number.",
    sources: `[1] Holding: Anthropic, current mark $250,000, cost basis $100,000`,
  },
  {
    n: 10,
    archetype: "Business",
    type: "single lookup",
    lang: "en",
    question: "When is the ConEd invoice due?",
    sources: `[1] Upload: "ConEd May invoice" · amount $1,240.18 · due 2026-06-15`,
  },
  {
    n: 11,
    archetype: "Business",
    type: "roll-up",
    lang: "en",
    question: "What are my recurring software expenses?",
    sources: `[1] Trackable: Adobe CC, $59.99/mo
[2] Trackable: Notion, $16/mo
[3] Trackable: AWS, ~$430/mo
[4] Trackable: Figma, $45/mo`,
  },
  {
    n: 12,
    archetype: "Business",
    type: "document action needed",
    lang: "en",
    question: "Is there anything I need to sign?",
    sources: `[1] Upload: "Mutual NDA - Brightline" · status awaiting your signature · received 2026-06-08`,
  },
  {
    n: 13,
    archetype: "Business",
    type: "roll-up (French, tutoiement, EUR)",
    lang: "fr",
    question: "Combien j'ai facturé ce mois-ci?",
    sources: `[1] Facture #2041 · client Maison Leduc · 3 200 EUR · 2026-06-04
[2] Facture #2042 · client Atelier Sud · 1 850 EUR · 2026-06-18`,
  },
  {
    n: 14,
    archetype: "Family Office",
    type: "single lookup",
    lang: "en",
    question: "When does the Aspen property insurance renew?",
    sources: `[1] Record: "Aspen residence policy" · carrier Chubb · renews 2026-07-01 · premium $18,400/yr`,
  },
  {
    n: 15,
    archetype: "Family Office",
    type: "roll-up (multi-currency)",
    lang: "en",
    question: "What's the total across the three trusts?",
    sources: `[1] Trust: Marin Family Trust, $4,200,000
[2] Trust: Geneva Holdings Trust, 1,900,000 EUR
[3] Trust: Children's Education Trust, $850,000`,
  },
  {
    n: 16,
    archetype: "Family Office",
    type: "what to review",
    lang: "en",
    question: "What needs my attention across the family entities?",
    sources: `[1] Marin Family Trust: K-1 not yet received from accountant
[2] Geneva Holdings: wire of 250,000 EUR pending approval
[3] Aspen residence policy renews 2026-07-01`,
  },
  {
    n: 17,
    archetype: "Family Office",
    type: "single lookup (Arabic, MSA, RTL)",
    lang: "ar",
    question: "متى تنتهي صلاحية جواز سفر ابنتي؟",
    sources: `[1] سجل: "جواز سفر ليلى" · تنتهي الصلاحية 2027-03-22`,
  },
  {
    n: 18,
    archetype: "Personal",
    type: "single lookup (Spanish, tuteo)",
    lang: "es",
    question: "¿Cuándo es el cumpleaños de mi mamá?",
    sources: `[1] Nota: "Cumpleaños de mamá" · 14 de agosto`,
  },
  {
    n: 19,
    archetype: "Personal",
    type: "casual greeting",
    lang: "en",
    question: "morning",
    sources: `[1] Calendar: Standup 10:00
[2] Reminder: AmEx autopays $1,240 at 09:00`,
  },
  {
    n: 20,
    archetype: "Investor",
    type: "roll-up (currency split)",
    lang: "en",
    question: "What did I wire last quarter?",
    sources: `[1] Wire: $500,000 to Helix Bio SPV · 2026-04-10
[2] Wire: 300,000 EUR to Northwind · 2026-05-02
[3] Wire: $150,000 to Lumen bridge · 2026-05-28`,
  },
];

function userMessage(s: Sample): string {
  return `SOURCES\n${s.sources}\n\nQUESTION\n${s.question}`;
}

async function askAnthropic(client: Anthropic, s: Sample): Promise<string> {
  const res = await client.messages.create({
    model: modelFor("anthropic", "fast"),
    max_tokens: 400,
    temperature: 0.3,
    system: SYSTEM,
    messages: [{ role: "user", content: userMessage(s) }],
  });
  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function askOpenAI(client: OpenAI, s: Sample): Promise<string> {
  const res = await client.chat.completions.create({
    model: modelFor("openai", "fast"),
    max_tokens: 400,
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMessage(s) },
    ],
  });
  return (res.choices[0]?.message?.content ?? "").trim();
}

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
  const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

  const present: string[] = [];
  if (anthropic) present.push("Anthropic");
  if (openai) present.push("OpenAI");
  const flagged: string[] = [];
  if (!anthropic) flagged.push("Anthropic");
  if (!openai) flagged.push("OpenAI");
  if (!geminiKey) flagged.push("Gemini");

  console.log(`Providers live: ${present.join(", ") || "none"}`);
  console.log(`Providers flagged (no key): ${flagged.join(", ") || "none"}`);

  let totalViolations = 0;
  const out: string[] = [];
  out.push("# Round 14.7 voice samples");
  out.push("");
  out.push(
    "Twenty Ask-style outputs across the launch archetypes, generated live through the providers whose keys are configured, using the canonical voice block from lib/voice/oria-voice.ts. Read each answer against docs/voice/oria-voice.md.",
  );
  out.push("");
  out.push(`Generated live on: ${present.join(", ") || "none"}.`);
  out.push(
    `Flagged, no key in env so live output not verified: ${flagged.join(", ") || "none"}.`,
  );
  out.push("");
  out.push(
    "Each sample below ran the same system prompt (the shared voice plus a minimal Ask framing) and the same question on every live provider, so the answers are directly comparable for cross-provider voice parity. Every answer was scanned for banned phrases; any hit is noted inline.",
  );
  out.push("");

  for (const s of SAMPLES) {
    out.push(`## ${s.n}. ${s.archetype} | ${s.type} | lang ${s.lang}`);
    out.push("");
    out.push(`Q: ${s.question}`);
    out.push("");
    out.push("Sources:");
    out.push("```");
    out.push(s.sources);
    out.push("```");
    out.push("");

    if (anthropic) {
      const a = await askAnthropic(anthropic, s);
      const hits = findBannedPhrases(a);
      totalViolations += hits.length;
      out.push(`A (Anthropic ${modelFor("anthropic", "fast")}):`);
      out.push(a);
      if (hits.length) out.push(`> SLOP: ${hits.join(", ")}`);
      out.push("");
      console.log(`#${s.n} Anthropic: ${hits.length ? "SLOP " + hits.join(",") : "clean"}`);
    }
    if (openai) {
      const o = await askOpenAI(openai, s);
      const hits = findBannedPhrases(o);
      totalViolations += hits.length;
      out.push(`A (OpenAI ${modelFor("openai", "fast")}):`);
      out.push(o);
      if (hits.length) out.push(`> SLOP: ${hits.join(", ")}`);
      out.push("");
      console.log(`#${s.n} OpenAI: ${hits.length ? "SLOP " + hits.join(",") : "clean"}`);
    }
  }

  out.push("---");
  out.push("");
  out.push(`Total banned-phrase hits across all live outputs: ${totalViolations}.`);
  out.push("");

  const path = join(process.cwd(), "docs", "voice", "round-14_7-samples.md");
  writeFileSync(path, out.join("\n") + "\n", "utf8");
  console.log(`\nWrote ${path}`);
  console.log(`Total banned-phrase hits: ${totalViolations}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
