import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import bank from "./question-bank.json";
import { classifyIntent, questionTreeKey, type OnboardingIntent } from "./intents";
import {
  EMPTY_USER_CONTEXT,
  type ConversationState,
  type EngineMode,
  type EngineStep,
  type QuestionType,
  type UserContext,
} from "./types";

type BankQuestion = {
  id: string;
  type: QuestionType;
  base: string;
  options?: string[];
  adaptive?: boolean;
  field?: string;
};

type Bank = {
  intro: BankQuestion[];
  trees: Record<string, BankQuestion[]>;
  reconfigure: BankQuestion[];
};

const BANK = bank as Bank;

const LANG: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
};

const NO_EMDASH =
  "Never use the em-dash character (Unicode U+2014). Use a comma, a period, or a rewrite. Zero exceptions.";

/**
 * The reusable onboarding/reshape conversation engine. Two modes:
 *   initial_setup  - 4 to 6 adaptive questions that distil a UserContext.
 *   reconfigure    - 1 to 3 short questions around a stated intent (F5).
 *
 * Each question is reworded by Haiku to flow warmly from the previous answer
 * and to appear in the user's language; the final UserContext is synthesised by
 * the stronger model. Degrades gracefully to the English base questions when no
 * AI key is configured.
 */
export class ConversationEngine {
  constructor(
    private readonly mode: EngineMode,
    private readonly locale: string = "en",
  ) {}

  /** The intent classified from Q1's answer. "personal" until Q1 is answered,
   *  so the very first question is always the intro. After Q1 the tree branches. */
  private intentOf(state: ConversationState): OnboardingIntent {
    if (this.mode !== "initial_setup") return "personal";
    const first = state.answers[0];
    return first && !first.skipped ? classifyIntent(first.answer) : "personal";
  }

  /** The question list for the current state: intro + the intent's tree, or the
   *  reconfigure list. Every initial_setup tree is the same length, so progress
   *  stays stable once Q1 branches. */
  private questionsFor(state: ConversationState): BankQuestion[] {
    if (this.mode === "reconfigure") return BANK.reconfigure;
    const tree = BANK.trees[questionTreeKey(this.intentOf(state))] ?? BANK.trees.personal;
    return [...BANK.intro, ...tree];
  }

  private totalFor(questions: BankQuestion[]): number {
    return this.mode === "initial_setup" ? questions.length : Math.min(2, questions.length);
  }

  async nextStep(state: ConversationState): Promise<EngineStep> {
    const asked = state.answers.length;
    const questions = this.questionsFor(state);
    const total = this.totalFor(questions);
    if (asked >= total) {
      return { done: true, userContext: await this.synthesize(state) };
    }

    const q = questions[asked];
    const text = await this.rewordQuestion(q, state);
    return {
      done: false,
      question: {
        id: q.id,
        text: text.text,
        type: q.type,
        options: q.type === "multiple_choice" ? text.options ?? q.options : undefined,
      },
      progress: { current: asked + 1, total },
    };
  }

  /** Reword a question + its options into the user's language, flowing from the
   *  last answer. Falls back to the English base on any failure. */
  private async rewordQuestion(
    q: BankQuestion,
    state: ConversationState,
  ): Promise<{ text: string; options?: string[] }> {
    const anthropic = getAnthropic();
    const language = LANG[this.locale] ?? "English";
    const fallback = { text: q.base, options: q.options };
    if (!anthropic) return fallback;

    const history = state.answers
      .filter((a) => !a.skipped)
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join("\n");
    const intentLine = state.intent ? `\nThe user's request: "${state.intent}".` : "";

    const system = `You are Oria's warm, plain-spoken onboarding guide. Rewrite ONE question so it flows naturally from the conversation and sounds like a friendly person, not a form. Keep it short (one sentence). Write in ${language}.${intentLine}
${q.adaptive ? "This is an adaptive follow-up: make it specific to what the user just said (e.g. if they named two roles, ask about both)." : ""}
If the user's last answer was confusing or off-topic, gently rephrase to help them answer.
${NO_EMDASH}
Return JSON only: {"text": "the question", ${q.type === "multiple_choice" ? `"options": ["...", "..."]` : `"options": null`}}`;

    const user = `Conversation so far:\n${history || "(none yet)"}\n\nBase question: "${q.base}"${
      q.type === "multiple_choice" ? `\nBase options: ${JSON.stringify(q.options)} (translate/adapt them into ${language}; keep the same count and meaning)` : ""
    }`;

    try {
      const msg = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: user }],
      });
      const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned) as { text?: string; options?: string[] | null };
      return {
        text: parsed.text?.trim() || q.base,
        options: Array.isArray(parsed.options) && parsed.options.length ? parsed.options : q.options,
      };
    } catch {
      return fallback;
    }
  }

  /** Distil the answered conversation into a structured UserContext. */
  async synthesize(state: ConversationState): Promise<UserContext> {
    const intent = this.intentOf(state);
    const anthropic = getAnthropic();
    if (!anthropic) {
      return { ...EMPTY_USER_CONTEXT, intent, notes: answersToNotes(state) };
    }

    const transcript = state.answers
      .map((a) => `Q: ${a.question}\nA: ${a.skipped ? "(skipped)" : a.answer}`)
      .join("\n\n");
    const intentLine = state.intent ? `\nThe user opened this with: "${state.intent}".` : "";

    const system = `You read an onboarding conversation and distil it into JSON describing the person, so Oria can build a workspace around them.${intentLine}
${NO_EMDASH}
Return JSON only:
{
  "roles": ["short role labels, e.g. teacher, football coach, renter"],
  "life_contexts": ["areas of life, e.g. family, health, finances"],
  "chaos_areas": ["what overwhelms them most"],
  "data_sources": ["where their info lives, e.g. email, paper, apps"],
  "collaborators": ["who else is involved, e.g. partner, team; empty if solo"],
  "week_one_priority": "the one thing they want help with first, one short phrase",
  "notes": "any other useful detail, one or two sentences"
}
Infer sensibly from partial answers. Keep arrays tight (max 5 each).`;

    try {
      const model = process.env.ANTHROPIC_SYNTHESIS_MODEL ?? getModel();
      const msg = await anthropic.messages.create({
        model,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: transcript || "(no answers)" }],
      });
      const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned) as Partial<UserContext>;
      return {
        roles: arr(parsed.roles),
        life_contexts: arr(parsed.life_contexts),
        chaos_areas: arr(parsed.chaos_areas),
        data_sources: arr(parsed.data_sources),
        collaborators: arr(parsed.collaborators),
        week_one_priority: typeof parsed.week_one_priority === "string" ? parsed.week_one_priority : "",
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        intent,
      };
    } catch {
      return { ...EMPTY_USER_CONTEXT, intent, notes: answersToNotes(state) };
    }
  }
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
}

function answersToNotes(state: ConversationState): string {
  return state.answers
    .filter((a) => !a.skipped && a.answer)
    .map((a) => a.answer)
    .join(". ")
    .slice(0, 500);
}
