import "server-only";

import type { Message as ProviderMessage } from "@/lib/ai-providers";
import { VOICE_RULES } from "@/lib/voice/oria-voice";
import { streamConversation } from "./conversation-stream";
import { recordAiCall, recordAiError } from "./telemetry";
import type { RetrievedSource } from "./retrieve";
import type { WorkspaceContext } from "@/lib/data/workspace-context";

export type AgentMessage = { role: "user" | "assistant"; content: string };

/** Optional attribution so a streamed answer lands in AI telemetry. */
export type AgentTelemetry = {
  organizationId?: string | null;
  actorId?: string | null;
};

// The Work agent shares Oria's voice (lib/voice/oria-voice.ts) and adds the
// analyst content rules below. Same single-sourced voice as Ask; the job
// (in-house analyst, citations required) is what differs.
const WORK_CONTENT_RULES = `CONTENT RULES:
- Ground every concrete claim in a SOURCE. Cite inline with the bracket id, e.g. "Building A's rent rose 4% YoY [3]." Never invent a citation.
- STRUCTURED RECORDS FIRST, FILES SECOND. Many sources are structured rows the extractor already produced (merchant, amount, currency, occurred_at, direction, recurrence). When both a row and the raw upload match a question, answer from the row and cite the upload only if it adds detail. Rows are work the model already did; files are the source.
- When sources don't cover a question, say so honestly and tell the user what to upload (e.g. "I don't have the May invoice from ConEd; upload it and I'll pull this together").
- Be precise with numbers. Show units. Show currency. Round in a way an analyst would (one decimal for percentages, no decimals for round-number totals).
- Comparisons: if the user asks "vs last month" or "compared to last quarter" and the data isn't both sides of the comparison, say which side is missing.
- For sensitive operational items (lease expirations, insurance renewals, payment delays) prefer specifics over generalities. Name the tenant. Name the date. Name the dollar figure.

BEHAVE LIKE AN IN-HOUSE ANALYST, NOT A DOCUMENT READER.

When the question is a single lookup, give the specific answer in two to four sentences.

When the question is a roll-up (totals, breakdowns, lists, summaries, "show me my recent X", "how much", "how many", "this quarter / month", "compare", "average"), DO THE WORK:
- Sum the relevant numbers across the sources and lead with the headline figure.
- Follow with a short breakdown grouped by what the user asked for (vendor, section, period). Put each line on its own line, no bullet or dash prefix.
- If amounts span multiple currencies, separate them.
- End with one small offer of help only if it's useful ("Should I generate a finance report for the month?").

Numbers are facts. Don't hedge them with "approximately" unless sources actually conflict.`;

function buildSystem(workspaceName: string, ctx: WorkspaceContext | null): string {
  const lines: string[] = [];
  lines.push(
    `You are the operational AI analyst for the "${workspaceName}" Workspace inside Oria.`,
  );
  lines.push(
    `HARD ISOLATION RULE: You see ONLY documents and data inside the "${workspaceName}" Workspace. You have no visibility into the user's personal space, their circles, or any other Workspace. If the user asks about anything outside this Workspace, even if you might have helped them with it elsewhere, answer honestly that it's not part of this Workspace and stop. Never speculate from memory. Never carry information between Workspaces. The sources block below is the complete and only set of data you may use.`,
  );
  if (ctx?.description) {
    lines.push(`\nWORKSPACE CONTEXT:\n${ctx.description}`);
  }
  if (ctx?.ai_instructions) {
    lines.push(`\nSTANDING INSTRUCTIONS:\n${ctx.ai_instructions}`);
  }
  if (ctx?.preferred_metrics && ctx.preferred_metrics.length > 0) {
    lines.push(
      `\nPREFERRED METRICS the user cares about: ${ctx.preferred_metrics.join(", ")}. Surface these when they're relevant to the question.`,
    );
  }
  if (ctx?.preferred_report_style) {
    lines.push(
      `\nPREFERRED REPORT STYLE: ${ctx.preferred_report_style}. Keep the tone consistent when generating summaries.`,
    );
  }
  lines.push(
    "\nSOURCES are everything Oria has read in this Workspace: uploaded files (invoices, leases, contracts, statements), extracted line items, and any memories saved against sections. Each source has an id in brackets like [2] and is marked READY or PENDING. PENDING means the file exists but extraction hasn't finished yet. Say so, don't pretend.",
  );
  lines.push("\n" + VOICE_RULES + "\n\n" + WORK_CONTENT_RULES);
  return lines.join("\n");
}

function formatSource(s: RetrievedSource): string {
  const state = s.processing_state === "pending" ? "PENDING" : "READY";
  const kindLabel =
    s.kind === "upload" ? "Upload" : s.kind === "reminder" ? "Reminder" : "Memory";
  const head = `[${s.id}] (${state}) ${kindLabel}: "${s.title}"${s.meta.section_label ? ` · ${s.meta.section_label}` : ""}${s.meta.date_label ? ` · ${s.meta.date_label}` : ""}`;
  return `${head}\n${s.snippet}`;
}

/**
 * Streaming Work agent. Same NDJSON shape as Ask Oria, but the system
 * prompt carries the Workspace's standing context + the model is told to
 * behave like a careful in-house analyst rather than a quick retrieval bot.
 */
export async function* streamWorkAgent(input: {
  /** The signed-in user, used to route to their connected AI provider. */
  userId: string;
  query: string;
  history?: AgentMessage[];
  sources: RetrievedSource[];
  workspaceName: string;
  workspaceContext: WorkspaceContext | null;
  /** Optional attribution for AI telemetry (cost/latency/errors). */
  telemetry?: AgentTelemetry;
}): AsyncGenerator<string, void, unknown> {
  const sourceBlock =
    input.sources.length === 0
      ? "(no sources matched this question. Be honest about what you don't have.)"
      : input.sources.map(formatSource).join("\n\n");

  const userMessage = `SOURCES\n${sourceBlock}\n\nQUESTION\n${input.query}`;

  const messages: ProviderMessage[] = [
    { role: "system", content: buildSystem(input.workspaceName, input.workspaceContext) },
    ...(input.history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const startedAt = Date.now();
  let usedModel = "";
  let usage = { input: 0, output: 0 };

  try {
    for await (const delta of streamConversation({
      userId: input.userId,
      messages,
      options: {
        tier: "fast",
        maxTokens: 1200,
        onUsage: (u) => {
          usedModel = u.model;
          usage = u.tokens;
        },
      },
    })) {
      yield delta;
    }
  } catch (e) {
    recordAiError({
      surface: "work-agent",
      model: usedModel || "conversation",
      latencyMs: Date.now() - startedAt,
      error: e,
      organizationId: input.telemetry?.organizationId ?? null,
      actorId: input.telemetry?.actorId ?? null,
    });
    throw e;
  }

  recordAiCall({
    surface: "work-agent",
    model: usedModel,
    inputTokens: usage.input,
    outputTokens: usage.output,
    latencyMs: Date.now() - startedAt,
    organizationId: input.telemetry?.organizationId ?? null,
    actorId: input.telemetry?.actorId ?? null,
  });
}
