import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./anthropic";
import { recordAiCall, recordAiError } from "./telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContextByOrgId } from "@/lib/data/workspace-context";
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

type ReminderRow = {
  id: string;
  title: string;
  due_at: string | null;
  done: boolean;
};

type CurrencyTotals = {
  currency: string;
  inflow: number;
  outflow: number;
  net: number;
  inCount: number;
  outCount: number;
};

type MonthlyBucket = {
  month: string; // "2026-03"
  inflow: number;
  outflow: number;
  count: number;
};

type VendorBucket = {
  merchant: string;
  total: number;
  currency: string | null;
  count: number;
};

type SectionBucket = {
  section: string;
  outflow: number;
  inflow: number;
  count: number;
  currency: string | null;
};

type Aggregates = {
  rows: AggregateRow[];
  recentRows: AggregateRow[]; // narrow set for the LINE ITEMS block
  byCurrency: CurrencyTotals[];
  monthlyByCurrency: Record<string, MonthlyBucket[]>;
  topVendorsByOutflow: VendorBucket[];
  sectionBreakdown: SectionBucket[];
  outstanding: {
    overdue: ReminderRow[];
    upcoming30d: ReminderRow[];
  };
  recurring: Array<{
    merchant: string;
    avg: number;
    currency: string | null;
    count: number;
  }>;
};

/**
 * Per-file digest the report generator sends to Claude so the model
 * can answer "compare these two files" or "summarize this spreadsheet"
 * by name. Built by collectFiles.
 *
 * raw_text is the extraction content — Claude already read this file
 * once at upload time, so we pass that derived text instead of the
 * original bytes (cheaper + already classified). itemSummaries are a
 * couple of memory_items so the model sees structured fields too.
 */
type WorkspaceFile = {
  uploadId: string;
  filename: string;
  documentType: string | null;
  mime: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  /** Extraction.raw_text, trimmed to per-file budget. */
  body: string | null;
  /** Compact item-level facts pulled from memory_items. */
  itemSummaries: string[];
  /** Relevance score against the prompt. Highest first. */
  score: number;
};

/**
 * Pre-aggregate memory_items + reminders for the Workspace so the
 * analyst LLM doesn't have to derive monthly series, currency splits,
 * vendor rollups, or late-payment lists from raw rows. The richer the
 * pre-aggregation, the more of the model's budget goes to analysis
 * (trends, ratios, forecasts) instead of arithmetic.
 *
 * Scope: caller-supplied organizationId only. Uses the admin client
 * because this runs from after()-style background work where cookies
 * are unreadable; the explicit organization_id filter is the only
 * scoping signal.
 */
async function collectAggregates(organizationId: string): Promise<Aggregates> {
  const supabase = createAdminClient();

  // 12-month window. Trends and forecasts need at least a year of
  // depth; small enough that one query stays cheap.
  const now = new Date();
  const since = new Date(now);
  since.setMonth(since.getMonth() - 12);
  const sinceISO = since.toISOString();

  const [itemsRes, remindersRes] = await Promise.all([
    supabase
      .from("memory_items")
      .select(
        "id, section, document_type, merchant, amount_value, amount_currency, amount_normalized, direction, occurred_at, title, summary, is_recurring, recurring_interval, smart_section",
      )
      .eq("organization_id", organizationId)
      .gte("occurred_at", sinceISO)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(2000),
    supabase
      .from("reminders")
      .select("id, title, due_at, done")
      .eq("organization_id", organizationId)
      .not("due_at", "is", null)
      .order("due_at", { ascending: true })
      .limit(200),
  ]);

  const rows = ((itemsRes.data ?? []) as AggregateRow[]).filter(Boolean);
  const reminderRows = ((remindersRes.data ?? []) as ReminderRow[]).filter(
    Boolean,
  );

  // recentRows = first 100 of the time-ordered fetch. Goes into the
  // LINE ITEMS block so the model can sanity-check aggregates.
  const recentRows = rows.slice(0, 100);

  // -- byCurrency totals -----------------------------------------------
  const totalsByCur = new Map<string, CurrencyTotals>();
  for (const r of rows) {
    if (!r.amount_normalized || !r.amount_currency) continue;
    const cur = r.amount_currency;
    const cell =
      totalsByCur.get(cur) ?? {
        currency: cur,
        inflow: 0,
        outflow: 0,
        net: 0,
        inCount: 0,
        outCount: 0,
      };
    if (r.direction === "inflow") {
      cell.inflow += r.amount_normalized;
      cell.inCount += 1;
    } else if (r.direction === "outflow") {
      cell.outflow += r.amount_normalized;
      cell.outCount += 1;
    }
    totalsByCur.set(cur, cell);
  }
  for (const c of totalsByCur.values()) c.net = c.inflow - c.outflow;
  const byCurrency = Array.from(totalsByCur.values()).sort(
    (a, b) =>
      Math.abs(b.inflow) + Math.abs(b.outflow) - Math.abs(a.inflow) - Math.abs(a.outflow),
  );

  // -- monthly series per currency ------------------------------------
  // Pre-seed 12 buckets so silent months show up as zeros (the model
  // needs to see them to spot drops or gaps).
  const monthlyByCurrency: Record<string, MonthlyBucket[]> = {};
  for (const cur of totalsByCur.keys()) {
    monthlyByCurrency[cur] = buildEmptyMonths(now, 12);
  }
  for (const r of rows) {
    if (!r.amount_normalized || !r.amount_currency || !r.occurred_at) continue;
    const key = monthKey(new Date(r.occurred_at));
    const series = monthlyByCurrency[r.amount_currency];
    if (!series) continue;
    const bucket = series.find((b) => b.month === key);
    if (!bucket) continue;
    if (r.direction === "inflow") bucket.inflow += r.amount_normalized;
    else if (r.direction === "outflow") bucket.outflow += r.amount_normalized;
    bucket.count += 1;
  }

  // -- top vendors by outflow -----------------------------------------
  const vendorMap = new Map<string, VendorBucket>();
  for (const r of rows) {
    if (r.direction !== "outflow" || !r.merchant || !r.amount_normalized)
      continue;
    const key = r.merchant.trim();
    if (!key) continue;
    const cell = vendorMap.get(key) ?? {
      merchant: key,
      total: 0,
      currency: r.amount_currency,
      count: 0,
    };
    cell.total += r.amount_normalized;
    cell.count += 1;
    cell.currency = cell.currency ?? r.amount_currency;
    vendorMap.set(key, cell);
  }
  const topVendorsByOutflow = Array.from(vendorMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // -- section breakdown ----------------------------------------------
  const sectionMap = new Map<string, SectionBucket>();
  for (const r of rows) {
    if (!r.amount_normalized) continue;
    const key = r.section ?? r.smart_section ?? "unsorted";
    const cell = sectionMap.get(key) ?? {
      section: key,
      outflow: 0,
      inflow: 0,
      count: 0,
      currency: r.amount_currency,
    };
    if (r.direction === "outflow") cell.outflow += r.amount_normalized;
    if (r.direction === "inflow") cell.inflow += r.amount_normalized;
    cell.count += 1;
    cell.currency = cell.currency ?? r.amount_currency;
    sectionMap.set(key, cell);
  }
  const sectionBreakdown = Array.from(sectionMap.values())
    .sort((a, b) => b.outflow + b.inflow - a.outflow - a.inflow)
    .slice(0, 15);

  // -- recurring ------------------------------------------------------
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
      count: v.count,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  // -- outstanding reminders ------------------------------------------
  const nowMs = now.getTime();
  const in30dMs = nowMs + 30 * 24 * 60 * 60 * 1000;
  const overdue: ReminderRow[] = [];
  const upcoming30d: ReminderRow[] = [];
  for (const r of reminderRows) {
    if (r.done || !r.due_at) continue;
    const due = new Date(r.due_at).getTime();
    if (Number.isNaN(due)) continue;
    if (due < nowMs) overdue.push(r);
    else if (due <= in30dMs) upcoming30d.push(r);
  }

  return {
    rows,
    recentRows,
    byCurrency,
    monthlyByCurrency,
    topVendorsByOutflow,
    sectionBreakdown,
    outstanding: {
      overdue: overdue.slice(0, 15),
      upcoming30d: upcoming30d.slice(0, 15),
    },
    recurring,
  };
}

/**
 * Pull every non-deleted upload in the workspace plus its extraction
 * raw_text + a handful of memory_items, score against the prompt by
 * filename/title token overlap, and return the top files trimmed to
 * fit a per-file character budget.
 *
 * Scope: organizationId only. The admin client bypasses RLS — the
 * caller is responsible for passing a Workspace org id, never a
 * personal/circle one. The route handler already enforces
 * `organization.kind === "office"`.
 *
 * Budget shape (rough):
 *   • MAX_FILES (12) total digests
 *   • RAW_TEXT_BUDGET (3000 chars) per file
 *   • At most 6 item summaries per file
 * Worst case is ~12 × 3000 = ~36K chars of file content. Well under
 * the Claude context window even with all other context blocks.
 */
const MAX_FILES = 12;
const RAW_TEXT_BUDGET = 3000;
const MAX_ITEM_SUMMARIES = 6;

async function collectFiles(
  organizationId: string,
  prompt: string,
): Promise<WorkspaceFile[]> {
  const supabase = createAdminClient();

  // Load uploads + their latest extraction in a single embed.
  type UploadRow = {
    id: string;
    filename: string;
    document_type: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    extractions: Array<{
      raw_text: string | null;
      processor: string | null;
      confidence: number | null;
      processed_at: string | null;
    }> | null;
  };
  const { data: uploadRows } = await supabase
    .from("uploads")
    .select(
      "id, filename, document_type, mime_type, size_bytes, created_at, extractions(raw_text, processor, confidence, processed_at)",
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const uploads = (uploadRows ?? []) as UploadRow[];
  if (uploads.length === 0) return [];

  // Pull memory_items for those uploads in one shot so we can include
  // structured per-file facts alongside the raw_text body.
  type ItemRow = {
    upload_id: string;
    title: string | null;
    merchant: string | null;
    amount_value: string | null;
    amount_currency: string | null;
    occurred_at: string | null;
    document_type: string | null;
    direction: string | null;
  };
  const ids = uploads.map((u) => u.id);
  const { data: itemRows } = await supabase
    .from("memory_items")
    .select(
      "upload_id, title, merchant, amount_value, amount_currency, occurred_at, document_type, direction",
    )
    .in("upload_id", ids)
    .is("deleted_at", null)
    .limit(2000);

  const itemsByUpload = new Map<string, ItemRow[]>();
  for (const it of (itemRows ?? []) as ItemRow[]) {
    const list = itemsByUpload.get(it.upload_id) ?? [];
    list.push(it);
    itemsByUpload.set(it.upload_id, list);
  }

  const tokens = tokenize(prompt);

  const scored: WorkspaceFile[] = uploads.map((u) => {
    const ext = (u.extractions ?? [])
      .filter((e) => e?.raw_text)
      .sort((a, b) =>
        (b.processed_at ?? "").localeCompare(a.processed_at ?? ""),
      )[0];
    const fileTokens = tokenize(u.filename);
    let score = 0;
    for (const t of tokens) {
      if (fileTokens.has(t)) score += 3;
      if (ext?.raw_text && ext.raw_text.toLowerCase().includes(t)) score += 1;
    }
    const items = itemsByUpload.get(u.id) ?? [];
    const itemSummaries = items.slice(0, MAX_ITEM_SUMMARIES).map(formatItem);
    const body = ext?.raw_text
      ? truncate(ext.raw_text, RAW_TEXT_BUDGET)
      : null;
    return {
      uploadId: u.id,
      filename: u.filename,
      documentType: u.document_type,
      mime: u.mime_type,
      sizeBytes: u.size_bytes,
      uploadedAt: u.created_at,
      body,
      itemSummaries,
      score,
    };
  });

  // Return mentioned-by-name files first, then the most recent files
  // until we hit MAX_FILES.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.uploadedAt.localeCompare(a.uploadedAt);
  });
  return scored.slice(0, MAX_FILES);
}

const TOKEN_STOPWORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "in", "on", "for", "with",
  "by", "at", "from", "is", "are", "was", "were", "be", "been", "this",
  "that", "these", "those", "it", "as", "vs", "between", "across", "all",
  "any", "what", "show", "compare", "analyze", "list", "find", "make",
  "give", "me", "tell", "summarize", "summary", "report", "please",
]);

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9_-]+/)) {
    const t = raw.trim();
    if (t.length < 2) continue;
    if (TOKEN_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + ` …(+${s.length - max} chars)`;
}

function formatItem(it: {
  title: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  occurred_at: string | null;
  document_type: string | null;
  direction: string | null;
}): string {
  const parts: string[] = [];
  if (it.occurred_at) parts.push(it.occurred_at.slice(0, 10));
  if (it.merchant) parts.push(it.merchant);
  if (it.amount_value) {
    parts.push(
      it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value,
    );
  }
  if (it.direction) parts.push(it.direction);
  if (it.document_type) parts.push(it.document_type);
  if (it.title) parts.push(`"${it.title}"`);
  return parts.join(" · ");
}

function buildEmptyMonths(now: Date, count: number): MonthlyBucket[] {
  const out: MonthlyBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    out.push({ month: monthKey(d), inflow: 0, outflow: 0, count: 0 });
  }
  return out;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
  /** Org context captured at request time so this can run from after(). */
  organizationId: string;
  organizationName: string;
  actorId?: string | null;
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

  const organizationId = input.organizationId;
  const organizationName = input.organizationName;

  const [workspaceContext, agg, files] = await Promise.all([
    getWorkspaceContextByOrgId(organizationId),
    collectAggregates(organizationId),
    collectFiles(organizationId, input.prompt),
  ]);

  const contextLines: string[] = [];
  contextLines.push(`WORKSPACE: ${organizationName}`);
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
  contextLines.push("TIME WINDOW: last 12 months of memory_items by occurred_at.");
  contextLines.push("");

  // CASHFLOW BY CURRENCY -----------------------------------------------------
  if (agg.byCurrency.length > 0) {
    contextLines.push("CASHFLOW BY CURRENCY (last 12 months):");
    for (const c of agg.byCurrency) {
      const sign = c.net >= 0 ? "+" : "";
      contextLines.push(
        `  ${c.currency}: inflow ${fmtMoney(c.inflow)} (n=${c.inCount}), outflow ${fmtMoney(c.outflow)} (n=${c.outCount}), net ${sign}${fmtMoney(c.net)}`,
      );
    }
    contextLines.push("");
  }

  // MONTHLY SERIES -----------------------------------------------------------
  for (const [cur, series] of Object.entries(agg.monthlyByCurrency)) {
    if (series.every((m) => m.count === 0)) continue;
    contextLines.push(`MONTHLY ${cur} (oldest → newest):`);
    for (const m of series) {
      contextLines.push(
        `  ${m.month}: in ${fmtMoney(m.inflow)} / out ${fmtMoney(m.outflow)} (n=${m.count})`,
      );
    }
    contextLines.push("");
  }

  // TOP VENDORS --------------------------------------------------------------
  if (agg.topVendorsByOutflow.length > 0) {
    contextLines.push("TOP VENDORS BY OUTFLOW (last 12 months):");
    for (const v of agg.topVendorsByOutflow) {
      contextLines.push(
        `  ${v.merchant}: ${fmtMoney(v.total)} ${v.currency ?? ""} (n=${v.count})`,
      );
    }
    contextLines.push("");
  }

  // SECTION BREAKDOWN --------------------------------------------------------
  if (agg.sectionBreakdown.length > 0) {
    contextLines.push("BY SECTION (last 12 months):");
    for (const s of agg.sectionBreakdown) {
      contextLines.push(
        `  ${s.section}: in ${fmtMoney(s.inflow)} / out ${fmtMoney(s.outflow)} ${s.currency ?? ""} (n=${s.count})`,
      );
    }
    contextLines.push("");
  }

  // RECURRING ----------------------------------------------------------------
  if (agg.recurring.length) {
    contextLines.push("TOP RECURRING CHARGES (avg per occurrence):");
    for (const r of agg.recurring) {
      contextLines.push(
        `  ${r.merchant}: ${fmtMoney(r.avg)} ${r.currency ?? ""} (${r.count} occurrences)`,
      );
    }
    contextLines.push("");
  }

  // OUTSTANDING ACTIONS ------------------------------------------------------
  const { overdue, upcoming30d } = agg.outstanding;
  if (overdue.length > 0 || upcoming30d.length > 0) {
    contextLines.push("OUTSTANDING REMINDERS:");
    if (overdue.length > 0) {
      contextLines.push("  Overdue:");
      for (const r of overdue) {
        contextLines.push(
          `    - "${r.title}" due ${r.due_at?.slice(0, 10) ?? "?"}`,
        );
      }
    }
    if (upcoming30d.length > 0) {
      contextLines.push("  Upcoming next 30d:");
      for (const r of upcoming30d) {
        contextLines.push(
          `    - "${r.title}" due ${r.due_at?.slice(0, 10) ?? "?"}`,
        );
      }
    }
    contextLines.push("");
  }

  // FILES IN WORKSPACE -------------------------------------------------------
  if (files.length > 0) {
    contextLines.push("FILES IN THIS WORKSPACE (most relevant first):");
    contextLines.push(
      "  Each entry has filename, document type, item summaries, and a body snippet pulled from prior extraction. Reference files by name when the user asked about specific ones. You can cross-reference data across files.",
    );
    for (const f of files) {
      const sizeKb = f.sizeBytes
        ? `${Math.round(f.sizeBytes / 1024)} KB`
        : "?";
      const tagLine = [
        f.documentType ?? "document",
        sizeKb,
        f.uploadedAt.slice(0, 10),
      ]
        .filter(Boolean)
        .join(" · ");
      contextLines.push("");
      contextLines.push(`  ┌── ${f.filename}  (${tagLine})`);
      if (f.itemSummaries.length > 0) {
        contextLines.push(`  │  Items (${f.itemSummaries.length}):`);
        for (const s of f.itemSummaries) {
          contextLines.push(`  │    - ${s}`);
        }
      }
      if (f.body) {
        contextLines.push(`  │  Body:`);
        for (const line of f.body.split("\n").slice(0, 80)) {
          contextLines.push(`  │  ${line}`);
        }
      }
      contextLines.push(`  └──`);
    }
    contextLines.push("");
  }

  // LINE ITEMS ---------------------------------------------------------------
  contextLines.push(`LINE ITEMS (100 most recent, for verification):`);
  for (const r of agg.recentRows) contextLines.push(formatRowForPrompt(r));

  const systemPrompt = `You are the in-house analyst for the "${organizationName}" Workspace, generating a structured operational analysis.

You MUST call the save_report tool exactly once. Don't reply with prose.

The user gets INSIGHT, not a file recap. Think like an analyst.

How to use the context blocks (already pre-aggregated for you — don't re-derive these from LINE ITEMS):
- FILES IN THIS WORKSPACE → individual uploads with filename + extracted body + structured items. Use this when the user asks about specific files ("compare these two", "summarize this spreadsheet", "what's in the lease"). The list is pre-ranked by relevance to the user's brief; the first few are usually what they meant.
  • If the user mentioned a filename token (e.g. "Waterfront", "lease", "March invoice"), prioritize the matching files and reference them by name in the summary and section bodies.
  • If the user asked vaguely ("compare these files", "this report"), use the first 1–3 files in the FILES list.
  • Cross-reference across files when the question implies it ("invoices vs payments", "lease A vs lease B"). Synthesize, don't just list per file.
  • Be honest when only one file matched — say "I'm using <filename>" instead of pretending you had more sources.
- CASHFLOW BY CURRENCY → total inflow/outflow/net per currency. Lead with these.
- MONTHLY {CUR} → time series for trends, comparisons, and forecasts. Use a LINE chart when the question is "trend / forecast / monthly / over time". Compute simple forecasts as the 3-month rolling average if asked.
- TOP VENDORS BY OUTFLOW → who you pay the most. Use a BAR chart or a TABLE.
- BY SECTION → operational concentration. Useful for "where is the money going."
- TOP RECURRING CHARGES → repeats. Useful for "recurring costs / subscriptions / utilities forecast."
- OUTSTANDING REMINDERS → late payments, upcoming renewals. Lead a "late payments" report with the Overdue list rendered as a TABLE (item · due date).
- LINE ITEMS is for spot-checking specific transactions only.

Report composition:
- 2–4 sentence executive summary that LEADS WITH THE ANSWER. Headline figure first.
- key_metrics: 2–6 figures the executive cares about (Net, Revenue, Cost/Revenue %, Top vendor share, Recurring monthly burn, etc.). Include a delta when the data supports it (e.g. "vs prior 3-month avg").
- sections: pick the visual that best fits.
  • LINE for time series, trends, forecasts.
  • BAR for categorical comparisons.
  • TABLE for breakdowns, lists, late payments, lease expirations.
  • Prose for qualitative analysis.

Ratios + forecasts:
- For ratios ("utilities / revenue", "expense / revenue"), compute from CASHFLOW + the relevant subset of LINE ITEMS or RECURRING. State the formula in plain English in the section body.
- For forecasts, use the MONTHLY series. State the method ("3-month rolling average" or "linear of last 6 months"). Project one period ahead by default; more only if the user asked.

Hard rules:
- Use only the data above. If something is missing, say so explicitly ("I don't have May utilities yet", "Only one file matched, so I can't compare"). Never invent figures.
- State assumptions in plain English in the section body when you computed anything derived (currency conversion not done, late-payment threshold = 30 days past due, etc.).
- If amounts span multiple currencies, separate them. Don't pretend they add.
- Skip a section rather than pad. A report with 2 strong sections beats one with 5 weak ones.
- If the brief refers to files and the FILES list has matches, name the files you used in the section bodies (e.g. "From Waterfront 04.26 Stacking Plan.xlsx…"). If FILES is empty, say "No matching files in this Workspace — I'm working from aggregated items only."
- Honour STANDING INSTRUCTIONS and PREFERRED METRICS when present.`;

  const reportModel =
    process.env.ANTHROPIC_EXTRACTION_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-6";
  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create({
      model: reportModel,
      // Bumped from 4096 — file-aware analyses with cross-file tables
      // and multi-section commentary regularly need 5–7K output tokens.
      max_tokens: 8192,
      system: systemPrompt,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "save_report" },
      messages: [{ role: "user", content: contextLines.join("\n") }],
    });
  } catch (e) {
    recordAiError({
      surface: "work-report",
      model: reportModel,
      latencyMs: Date.now() - startedAt,
      error: e,
      organizationId,
      actorId: input.actorId ?? null,
      extra: { prompt: input.prompt.slice(0, 200) },
    });
    const msg = e instanceof Error ? e.message : "unknown";
    return { ok: false, error: `Claude error: ${msg}` };
  }

  if (response.usage) {
    recordAiCall({
      surface: "work-report",
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
      organizationId,
      actorId: input.actorId ?? null,
    });
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
