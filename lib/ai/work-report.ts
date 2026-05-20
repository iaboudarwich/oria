import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./anthropic";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "@/lib/data/organizations";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import type { ReportPayload } from "@/lib/data/workspace-reports";

/**
 * On-demand report generator for the Work Agent. Pulls structured
 * aggregates from the Workspace's memory_items, hands them to Claude with
 * a tool-use schema that forces a clean ReportPayload back, and returns
 * { ok, payload, title } so the action can save the row.
 */

const REPORT_TOOL: Anthropic.Messages.Tool = {
  name: "save_report",
  description:
    "Save the structured operational report. Use clear headings, short paragraphs, and only the data the user provided.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short report title, e.g. 'Building A — March operations'.",
      },
      summary: {
        type: "string",
        description:
          "A 2–4 sentence executive summary. Lead with the answer to the user's brief.",
      },
      key_metrics: {
        type: "array",
        description:
          "0–6 headline metrics worth highlighting. Each has a short label, a value (with units/currency), and optional delta like '+4.2% vs last month'.",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            delta: { type: "string" },
          },
          required: ["label", "value"],
        },
      },
      sections: {
        type: "array",
        description:
          "1–6 substantive sections. Each has a heading and either prose, bullets, or one chart (or a mix). Don't pad. Skip a section rather than fill it with filler.",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: {
              type: "string",
              description: "Optional 1–3 short paragraphs of prose.",
            },
            bullets: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of crisp bullets.",
            },
            chart: {
              type: "object",
              description:
                "Optional visual. Pick the kind that best fits the question: 'bar' for categorical comparisons (vendors, sections), 'line' for time series (monthly trends, forecast curves), 'table' for breakdowns and lists (top tenants, late payments, lease expirations). For bar/line, x values are plain text labels and y values are numbers. For table, provide columns and rows.",
              properties: {
                kind: { type: "string", enum: ["bar", "line", "table"] },
                caption: { type: "string" },
                series: {
                  type: "array",
                  description:
                    "Required for bar/line. Omit for table.",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      data: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            x: { type: "string" },
                            y: { type: "number" },
                          },
                          required: ["x", "y"],
                        },
                      },
                    },
                    required: ["label", "data"],
                  },
                },
                table: {
                  type: "object",
                  description:
                    "Required for kind=table. 2–6 columns, ≤20 rows. Cells are short plain strings — money like '$1,243', dates like 'Mar 12', percentages like '14%'.",
                  properties: {
                    columns: {
                      type: "array",
                      items: { type: "string" },
                    },
                    rows: {
                      type: "array",
                      items: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                  required: ["columns", "rows"],
                },
              },
              required: ["kind"],
            },
          },
          required: ["heading"],
        },
      },
    },
    required: ["title", "summary", "sections"],
  } as Anthropic.Messages.Tool["input_schema"],
};

type AggregateRow = {
  id: string;
  section: string | null;
  document_type: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  amount_normalized: number | null;
  direction: "inflow" | "outflow" | null;
  occurred_at: string | null;
  title: string | null;
  summary: string | null;
  is_recurring: boolean | null;
  recurring_interval: string | null;
  smart_section: string | null;
};

/**
 * Pull a focused set of memory_items for the Workspace and shape them
 * into the JSON context the model will work from. Caps at 200 rows so
 * the prompt stays bounded; orders by occurred_at desc so the agent
 * sees the most recent operational activity first.
 */
async function collectAggregates(): Promise<{
  rows: AggregateRow[];
  totals: { inflow: number; outflow: number; currencies: string[] };
  recurring: Array<{ merchant: string; avg: number; currency: string | null }>;
}> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("memory_items")
    .select(
      "id, section, document_type, merchant, amount_value, amount_currency, amount_normalized, direction, occurred_at, title, summary, is_recurring, recurring_interval, smart_section",
    )
    .eq("organization_id", ctx.organization.id)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(200);

  const rows = ((data ?? []) as AggregateRow[]).filter(Boolean);

  let inflow = 0;
  let outflow = 0;
  const currencySet = new Set<string>();
  for (const r of rows) {
    if (r.amount_normalized) {
      if (r.direction === "inflow") inflow += r.amount_normalized;
      if (r.direction === "outflow") outflow += r.amount_normalized;
    }
    if (r.amount_currency) currencySet.add(r.amount_currency);
  }

  const recurringMap = new Map<
    string,
    { sum: number; count: number; currency: string | null }
  >();
  for (const r of rows) {
    if (!r.is_recurring || !r.merchant) continue;
    const v = r.amount_normalized ?? 0;
    const prev = recurringMap.get(r.merchant) ?? {
      sum: 0,
      count: 0,
      currency: r.amount_currency,
    };
    prev.sum += v;
    prev.count += 1;
    prev.currency = prev.currency ?? r.amount_currency;
    recurringMap.set(r.merchant, prev);
  }
  const recurring = Array.from(recurringMap.entries())
    .map(([merchant, v]) => ({
      merchant,
      avg: v.count > 0 ? v.sum / v.count : 0,
      currency: v.currency,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  return {
    rows,
    totals: { inflow, outflow, currencies: Array.from(currencySet) },
    recurring,
  };
}

function formatRowForPrompt(r: AggregateRow): string {
  const parts: string[] = [];
  if (r.occurred_at) parts.push(r.occurred_at.slice(0, 10));
  if (r.merchant) parts.push(r.merchant);
  if (r.amount_value) {
    parts.push(
      r.amount_currency
        ? `${r.amount_value} ${r.amount_currency}`
        : r.amount_value,
    );
  }
  if (r.direction) parts.push(r.direction);
  if (r.section) parts.push(`section:${r.section}`);
  if (r.is_recurring) parts.push("recurring");
  if (r.title) parts.push(`"${r.title}"`);
  return `- ${parts.join(" · ")}`;
}

export type GenerateInput = {
  prompt: string; // user brief — e.g. "March operations for Building A"
  kind: string; // user-picked kind (summary/finance/leases/forecast/custom)
};

export type GenerateResult =
  | { ok: true; payload: ReportPayload; title: string }
  | { ok: false; error: string };

export async function generateWorkReport(
  input: GenerateInput,
): Promise<GenerateResult> {
  const client = getAnthropic();
  if (!client) {
    return { ok: false, error: "Claude isn't connected." };
  }

  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") {
    return { ok: false, error: "Reports are for Workspaces only." };
  }

  const workspaceContext = await getWorkspaceContext();
  const { rows, totals, recurring } = await collectAggregates();

  const contextLines: string[] = [];
  contextLines.push(`WORKSPACE: ${ctx.organization.name}`);
  if (workspaceContext?.description) {
    contextLines.push(`PURPOSE: ${workspaceContext.description}`);
  }
  if (workspaceContext?.ai_instructions) {
    contextLines.push(`INSTRUCTIONS: ${workspaceContext.ai_instructions}`);
  }
  if (workspaceContext?.preferred_metrics?.length) {
    contextLines.push(
      `PREFERRED METRICS: ${workspaceContext.preferred_metrics.join(", ")}`,
    );
  }
  contextLines.push(`USER BRIEF: ${input.prompt}`);
  contextLines.push(`REPORT KIND: ${input.kind}`);
  contextLines.push("");
  contextLines.push(
    `TOTALS so far: inflow=${totals.inflow.toFixed(2)}, outflow=${totals.outflow.toFixed(2)}${totals.currencies.length ? ` (currencies seen: ${totals.currencies.join(", ")})` : ""}.`,
  );
  if (recurring.length) {
    contextLines.push("");
    contextLines.push("TOP RECURRING CHARGES (avg per occurrence):");
    for (const r of recurring) {
      contextLines.push(
        `- ${r.merchant}: ${r.avg.toFixed(2)} ${r.currency ?? ""}`,
      );
    }
  }
  contextLines.push("");
  contextLines.push(`LINE ITEMS (most recent first, up to 200 rows):`);
  for (const r of rows) contextLines.push(formatRowForPrompt(r));

  const systemPrompt = `You are the in-house analyst for the "${ctx.organization.name}" Workspace, generating a structured operational analysis.

You MUST call the save_report tool exactly once. Don't reply with prose.

Think like an analyst, not a document reader. The user is asking for INSIGHT, not a recap of files.

Compose the report like this:
- 2–4 sentence executive summary that LEADS WITH THE ANSWER. Headline number first.
- key_metrics: 2–6 headline figures the executive cares about (Net, Revenue, Cost/Revenue %, Top vendor, Largest line, etc.). Include a delta when the data supports it.
- sections: pick the visual that best fits the question. Use:
  • TABLE for breakdowns, lists, late payments, top tenants, lease expirations — anything that reads naturally as rows of fields.
  • BAR for categorical comparisons (top vendors, expenses by section, building A vs B).
  • LINE for time series (monthly revenue, expense trend, forecast curves).
  • Prose only when the analysis is qualitative.

Hard rules:
- Use only the data the user provided. If something is missing, say so explicitly ("I don't have May utilities yet"); never invent figures.
- Numbers must come from LINE ITEMS, TOTALS, or RECURRING. Cite them at the right precision (no decimals on round-number totals; one decimal on percentages).
- If amounts span multiple currencies, separate them. Don't pretend they add.
- Skip a section rather than pad with filler. A report with 2 strong sections beats one with 5 weak ones.
- Honour STANDING INSTRUCTIONS and PREFERRED METRICS when present.`;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model:
        process.env.ANTHROPIC_EXTRACTION_MODEL ??
        process.env.ANTHROPIC_MODEL ??
        "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "save_report" },
      messages: [{ role: "user", content: contextLines.join("\n") }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Claude error: ${message}` };
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    return { ok: false, error: "Model didn't produce a report." };
  }
  const raw = toolUse.input as Record<string, unknown>;
  const normalized = normalizePayload(raw);
  if (!normalized) {
    return { ok: false, error: "Report payload was malformed." };
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "Report";
  return { ok: true, payload: normalized, title };
}

function normalizePayload(raw: Record<string, unknown>): ReportPayload | null {
  const summary =
    typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!summary) return null;

  const sectionsIn = Array.isArray(raw.sections) ? raw.sections : [];
  const sections = sectionsIn
    .map((s) => normalizeSection(s))
    .filter((s): s is NonNullable<ReturnType<typeof normalizeSection>> => !!s);
  if (sections.length === 0) return null;

  const keyMetricsIn = Array.isArray(raw.key_metrics) ? raw.key_metrics : [];
  const key_metrics = keyMetricsIn
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const o = m as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label : "";
      const value = typeof o.value === "string" ? o.value : "";
      if (!label || !value) return null;
      const delta = typeof o.delta === "string" ? o.delta : undefined;
      return { label, value, ...(delta ? { delta } : {}) };
    })
    .filter((m): m is NonNullable<typeof m> => !!m);

  return { summary, sections, key_metrics };
}

function normalizeSection(raw: unknown): ReportPayload["sections"][number] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const heading = typeof o.heading === "string" ? o.heading.trim() : "";
  if (!heading) return null;

  const body = typeof o.body === "string" ? o.body : undefined;
  const bullets = Array.isArray(o.bullets)
    ? o.bullets.filter((b): b is string => typeof b === "string")
    : undefined;
  const chart = normalizeChart(o.chart);
  return {
    heading,
    ...(body ? { body } : {}),
    ...(bullets && bullets.length > 0 ? { bullets } : {}),
    ...(chart ? { chart } : {}),
  };
}

function normalizeChart(
  raw: unknown,
): NonNullable<ReportPayload["sections"][number]["chart"]> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const caption = typeof o.caption === "string" ? o.caption : undefined;

  // table — for breakdowns and lists
  if (o.kind === "table") {
    const tableIn = o.table as Record<string, unknown> | undefined;
    if (!tableIn || typeof tableIn !== "object") return null;
    const columns = Array.isArray(tableIn.columns)
      ? tableIn.columns.filter((c): c is string => typeof c === "string")
      : [];
    const rowsIn = Array.isArray(tableIn.rows) ? tableIn.rows : [];
    const rows = rowsIn
      .map((r) =>
        Array.isArray(r) ? r.map((c) => (typeof c === "string" ? c : String(c ?? ""))) : null,
      )
      .filter((r): r is string[] => !!r && r.length > 0);
    if (columns.length === 0 || rows.length === 0) return null;
    return {
      kind: "table",
      table: { columns, rows, ...(caption ? { caption } : {}) },
      ...(caption ? { caption } : {}),
    };
  }

  // bar / line — series-based
  const kind = o.kind === "bar" || o.kind === "line" ? o.kind : null;
  if (!kind) return null;
  const seriesIn = Array.isArray(o.series) ? o.series : [];
  const series = seriesIn
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const so = s as Record<string, unknown>;
      const label = typeof so.label === "string" ? so.label : "";
      if (!label) return null;
      const dataIn = Array.isArray(so.data) ? so.data : [];
      const data = dataIn
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const dr = d as Record<string, unknown>;
          const x = typeof dr.x === "string" ? dr.x : "";
          const y = typeof dr.y === "number" ? dr.y : NaN;
          if (!x || Number.isNaN(y)) return null;
          return { x, y };
        })
        .filter((p): p is { x: string; y: number } => !!p);
      if (data.length === 0) return null;
      return { label, data };
    })
    .filter((s): s is { label: string; data: { x: string; y: number }[] } => !!s);
  if (series.length === 0) return null;
  return { kind, series, ...(caption ? { caption } : {}) };
}
