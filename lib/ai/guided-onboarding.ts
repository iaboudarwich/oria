import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export type OnboardingTurn = {
  role: "user" | "assistant";
  content: string;
};

export type OnboardingAIResponse = {
  next_message: string;
  is_final: boolean;
  input_type?: "text" | "multi_select";
  options?: string[];
  suggestions?: OnboardingSuggestions;
};

export type OnboardingSuggestions = {
  sections: Array<{ name: string; icon: string; description: string }>;
  entity_types: Array<{
    key: string;
    label_plural: string;
    suggested_fields: Array<{ key: string; label: string; type: string }>;
  }>;
  entities: Array<{
    entity_type_key: string;
    name: string;
    prefill_fields: Record<string, string>;
  }>;
  trackable_categories: string[];
};

const CONVERSATION_SYSTEM = `You are Oria's onboarding assistant. Your job is to understand the user's life or work in 2-4 conversation turns, then suggest helpful sections, entity types, sample entities, and trackable categories.

Rules:
- Ask open-ended questions first ("Tell me about what you'd like to track...")
- After the first answer, move to structured follow-ups (multi_select) 
- Do NOT ask more than 4 questions total
- Keep messages short and warm
- Use second person ("you", "your")

Return JSON ONLY matching this schema:
{
  "next_message": "string",
  "is_final": false,
  "input_type": "text" | "multi_select",
  "options": ["string", ...] // only for multi_select
}

When done (after 3-4 turns), set is_final: true and include suggestions.`;

const SYNTHESIS_SYSTEM = `You are Oria's onboarding assistant. Based on the conversation about the user's needs, generate specific, practical suggestions for their workspace.

Return JSON ONLY:
{
  "next_message": "Here's what I think will help based on what you've shared...",
  "is_final": true,
  "suggestions": {
    "sections": [{"name": "...", "icon": "home|travel|finance|health|scales|wallet|tag|staff|heart|person", "description": "..."}],
    "entity_types": [{"key": "snake_case", "label_plural": "...", "suggested_fields": [{"key": "...", "label": "...", "type": "text|number|date|currency|enum"}]}],
    "entities": [{"entity_type_key": "...", "name": "...", "prefill_fields": {}}],
    "trackable_categories": ["insurance", "subscription", "lease", "membership", "certification", "id_document", "contract", "warranty", "other"]
  }
}

Limit: 3-5 sections, 2-4 entity types, 1-3 sample entities, 2-4 trackable categories.
Only include what genuinely fits. Quality over quantity.`;

/**
 * Get the AI's next response in an onboarding conversation.
 * Uses Haiku for conversation, Sonnet-level for final synthesis.
 *
 * `templateHints` is the human-readable label list of every template the
 * user picked on the multi-select picker ("Personal", "Investor /
 * Portfolio", …). When present it's injected as one extra context line
 * so suggestions match the merged starting point.
 */
export async function getOnboardingResponse(
  turns: OnboardingTurn[],
  mode: "first" | "improve" | "reprompt",
  templateHints?: string[],
): Promise<OnboardingAIResponse> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    return {
      next_message: "Tell me about yourself and what you'd like to track.",
      is_final: false,
      input_type: "text",
    };
  }

  const isFinalTurn = turns.filter((t) => t.role === "user").length >= 3;
  const systemPrompt = isFinalTurn ? SYNTHESIS_SYSTEM : CONVERSATION_SYSTEM;

  // Add mode-specific opener context
  const modeContext =
    mode === "improve"
      ? "The user has used Oria before and wants to improve their setup."
      : mode === "reprompt"
      ? "The user hasn't finished setting up Oria and came back to try."
      : "This is a brand-new user setting up Oria for the first time.";

  // Templates the user picked on the multi-select picker (if any). Listed
  // so the AI can ground follow-ups + final suggestions against the
  // merged starting point instead of asking from a blank slate.
  const templateContext =
    templateHints && templateHints.length > 0
      ? `\nWorkspace templates the user just picked: ${templateHints.join(", ")}. Build on these — don't re-ask what they already chose.`
      : "";

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `Context: ${modeContext}${templateContext}\n\nConversation history:\n${turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n\nRespond with JSON only.`,
    },
  ];

  try {
    // Use a slightly more capable model for final synthesis
    const model = isFinalTurn
      ? (process.env.ANTHROPIC_SYNTHESIS_MODEL ?? getModel())
      : getModel();

    const msg = await anthropic.messages.create({
      model,
      max_tokens: isFinalTurn ? 2000 : 500,
      system: systemPrompt,
      messages,
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as OnboardingAIResponse;
  } catch {
    // Fallback on parse failure
    if (isFinalTurn) {
      return {
        next_message: "Based on our conversation, I have some suggestions for you. Take a look!",
        is_final: true,
        suggestions: { sections: [], entity_types: [], entities: [], trackable_categories: [] },
      };
    }
    return {
      next_message: "Tell me more about what you'd like to track.",
      is_final: false,
      input_type: "text",
    };
  }
}

/** First message based on mode */
export function getOpeningMessage(mode: "first" | "improve" | "reprompt"): OnboardingAIResponse {
  if (mode === "improve") {
    return {
      next_message: "What's changed since you last set up Oria? Or what would you like to add?",
      is_final: false,
      input_type: "text",
    };
  }
  if (mode === "reprompt") {
    return {
      next_message: "Welcome back! Tell me a bit about your life — what kinds of documents, things, or deadlines do you deal with most?",
      is_final: false,
      input_type: "text",
    };
  }
  return {
    next_message: "Welcome to Oria! Tell me a bit about yourself — what kinds of things would you like to keep track of? (Property, businesses, health, travel, subscriptions, investments...)",
    is_final: false,
    input_type: "text",
  };
}
