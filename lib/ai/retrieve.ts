import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUserSpaces, requireContext } from "@/lib/data/organizations";
import { sectionLabel } from "@/lib/sections-meta";
import { listSectionMemories } from "@/lib/data/section-memory";
import type { SectionScope } from "@/lib/data/section-scope";
import type { Section } from "@/lib/supabase/types";

/**
 * One retrieved piece of context handed to Claude. Each gets a numeric id so
 * Claude can cite it inline as [N] and the UI can render a source card.
 *
 * processing_state:
 *   • "ready"   — full extraction available (raw_text + entities)
 *   • "pending" — file exists and matched by name, but Oria hasn't finished
 *                 reading it yet. The agent is told to be honest about this
 *                 rather than say "I don't see anything".
 */
export type RetrievedSource = {
  id: number; // 1-based slot for citations
  kind: "upload" | "reminder" | "memory";
  title: string;
  snippet: string;
  href: string;
  processing_state: "ready" | "pending";
  // Display metadata for the source card
  meta: {
    section_label: string | null;
    space_name: string;
    date_label: string | null;
  };
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "i",
  "me",
  "my",
  "mine",
  "we",
  "us",
  "our",
  "you",
  "your",
  "they",
  "them",
  "their",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "by",
  "with",
  "from",
  "about",
  "as",
  "into",
  "this",
  "that",
  "these",
  "those",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "should",
  "would",
  "will",
  "what",
  "when",
  "where",
  "who",
  "whom",
  "why",
  "how",
  "which",
  "show",
  "tell",
  "find",
  "give",
  "last",
  "next",
  "ago",
]);

/**
 * Distill the user's question into a short list of meaningful keywords.
 * Trimmed of punctuation, lowercase, stopwords removed, deduped, capped.
 */
export function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

const AGGREGATE_PATTERNS = [
  /\bhow\s*much\b/,
  /\bhow\s*many\b/,
  /\btotal(s)?\b/,
  /\bsum\b/,
  /\bbreakdown\b/,
  /\bsummar(y|ize)\b/,
  /\bshow\s+(me\s+)?(all|every|my\s+last|my\s+recent|recent|the\s+last)\b/,
  /\blist\s+(my\s+|the\s+|all\s+)?\b/,
  /\baverage\b/,
  /\bspent\b/,
  /\bcalor(ies|ie)\b/,
  /\bprotein\b|\bcarbs?\b|\bfat\b/,
  /\bthis\s+(week|month|year|quarter)\b/,
  /\blast\s+(week|month|year|quarter|night)\b/,
  /\btoday\b|\byesterday\b/,
  /\bwhat\s+did\s+i\b/,
  /\bcompare\b/,
];

export type AggregateIntent = {
  isAggregate: boolean;
  /** ISO timestamp lower bound when the query mentions a time window. */
  sinceISO: string | null;
  /** Set when the user clearly asks about money (spent, total, paid…). */
  wantsAmounts: boolean;
  /** Set when the user clearly asks about food (calories, protein, eat…). */
  wantsMacros: boolean;
};

const MONEY_RE =
  /\b(spent|spend|paid|owe|cost|expense|invoice|bill|total|sum|breakdown|how\s*much)\b/;
const FOOD_RE =
  /\b(ate|eaten|meal|meals|calor|protein|carbs?|fat|breakfast|lunch|dinner|snack|food)\b/;

/**
 * Detect whether the question wants a roll-up answer (totals, breakdown,
 * "show me all my X") versus a specific lookup. When aggregate, the
 * retriever broadens its pull so the agent has the data to sum/group.
 */
export function detectAggregateIntent(query: string): AggregateIntent {
  const q = query.toLowerCase();
  const isAggregate = AGGREGATE_PATTERNS.some((re) => re.test(q));
  const wantsAmounts = MONEY_RE.test(q);
  const wantsMacros = FOOD_RE.test(q);
  let sinceISO: string | null = null;
  if (isAggregate) {
    const now = new Date();
    if (/\btoday\b/.test(q)) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      sinceISO = d.toISOString();
    } else if (/\byesterday\b/.test(q)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      sinceISO = d.toISOString();
    } else if (/\bthis\s+week\b/.test(q) || /\blast\s+week\b/.test(q)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      sinceISO = d.toISOString();
    } else if (/\bthis\s+month\b/.test(q) || /\blast\s+month\b/.test(q)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 31);
      sinceISO = d.toISOString();
    } else if (/\bthis\s+quarter\b/.test(q) || /\blast\s+quarter\b/.test(q)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 92);
      sinceISO = d.toISOString();
    } else if (/\bthis\s+year\b/.test(q) || /\blast\s+year\b/.test(q)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      sinceISO = d.toISOString();
    }
  }
  return { isAggregate, sinceISO, wantsAmounts, wantsMacros };
}

/**
 * Retrieve the most relevant uploads + reminders for a query.
 *
 * Hard rule: every query is scoped to ONE active organization (or, with the
 * explicit `crossSpace: true` opt-in, to the user's personal-side spaces
 * only — personal + circles). RLS alone is not enough here: a member of
 * multiple orgs (e.g. their Personal space and a Work Workspace) is
 * authorised to read all of them under RLS, so any unfiltered query leaks
 * across spaces. The Work AI agent must never see personal data, and a
 * personal Ask must never see another Workspace's data — that's enforced
 * here, in the data layer, regardless of how the caller frames the query.
 *
 *   • scope set       → restrict to active org AND section (existing behaviour)
 *   • scope null      → restrict to active org only (default; was the leak)
 *   • crossSpace true → broaden to every personal/circle org the user has
 *                       joined, never including office Workspaces. Reserved
 *                       for an explicit "search across my personal spaces"
 *                       affordance the UI must request intentionally.
 */
export async function retrieveForQuery(
  query: string,
  opts: {
    maxSources?: number;
    scope?: SectionScope | null;
    crossSpace?: boolean;
  } = {},
): Promise<RetrievedSource[]> {
  const { scope = null, crossSpace = false } = opts;
  const keywords = extractKeywords(query);
  const intent = detectAggregateIntent(query);
  // Roll-up questions need a bigger pool of source rows so the agent can
  // actually sum. Single-target lookups stay tight to keep the prompt fast
  // and the answer focused.
  const maxSources = opts.maxSources ?? (intent.isAggregate ? 20 : 8);
  // Aggregate queries like "how much did I spend today" don't need
  // keyword matches — they need ALL relevant items. We still bail when
  // there's literally nothing to work with (no keywords, no scope, no
  // aggregation intent).
  if (keywords.length === 0 && !scope && !intent.isAggregate) return [];

  const supabase = await createClient();
  const ctx = await requireContext();
  const activeOrgId = ctx.organization.id;

  // Decide the set of org ids retrieval is allowed to touch. This is the
  // single source of truth — every query below applies it. A leak here is
  // a data isolation bug, so we hard-pin it rather than rely on RLS.
  let allowedOrgIds: string[];
  const userSpacesList = await listUserSpaces();
  if (crossSpace) {
    // God's Eye view: the account owner, sitting in their Personal space,
    // wants to find anything anywhere they have access to. We span every
    // org the signed-in user is a member of — Personal + Circles + their
    // own Workspaces. The asymmetry the user designed for stays intact:
    //   • Work AI always passes `crossSpace: false`, so a Workspace
    //     agent never sees Personal or other Workspaces.
    //   • A user sitting inside a Circle or Workspace can't use this —
    //     it's only allowed when the active org is `personal`, because
    //     that space is by definition just you.
    if (ctx.organization.kind !== "personal") {
      allowedOrgIds = [activeOrgId];
    } else {
      allowedOrgIds = userSpacesList.map((s) => s.organization.id);
      if (!allowedOrgIds.includes(activeOrgId)) {
        allowedOrgIds.push(activeOrgId);
      }
    }
  } else {
    allowedOrgIds = [activeOrgId];
  }

  const spaceById = new Map(
    userSpacesList.map((s) => [s.organization.id, s.organization]),
  );

  // When scoped to a section, also pull section-memories for the section
  // so Claude sees the user's standing context.
  const memoryRows: Array<{
    score: number;
    src: Omit<RetrievedSource, "id">;
  }> = [];
  if (scope) {
    const memories = await listSectionMemories(scope);
    const space = spaceById.get(activeOrgId);
    for (const m of memories) {
      // Every memory is included with a small base score so the agent has
      // it even if the query doesn't keyword-match the memory text.
      let score = 2;
      const hay = m.content.toLowerCase();
      for (const kw of keywords) if (hay.includes(kw)) score += kw.length;
      memoryRows.push({
        score,
        src: {
          kind: "memory",
          title: `Memory · ${scope.label}`,
          snippet: m.content,
          href:
            scope.kind === "smart"
              ? scope.key === "diet"
                ? "/dashboard/diet"
                : "/dashboard/bills"
              : `/dashboard/sections/${scope.key}`,
          processing_state: "ready",
          meta: {
            section_label: scope.label,
            space_name: space?.name ?? ctx.organization.name,
            date_label: null,
          },
        },
      });
    }
  }

  // -- Uploads ----------------------------------------------------------------
  // PostgREST `or` with multiple ilike clauses. Each clause matches the title
  // or filename. The extraction.raw_text match happens via a second pass
  // because PostgREST doesn't let us OR across nested relations.
  const uploadFilters = keywords
    .map((k) => {
      const safe = k.replace(/[%,]/g, "");
      return `title.ilike.*${safe}*,filename.ilike.*${safe}*`;
    })
    .join(",");

  let uploadsQ = supabase
    .from("uploads")
    .select(
      "id, title, filename, section, custom_section_id, organization_id, created_at",
    )
    .is("deleted_at", null)
    .in("organization_id", allowedOrgIds);
  if (keywords.length > 0) uploadsQ = uploadsQ.or(uploadFilters);
  if (scope) {
    if (scope.kind === "builtin") uploadsQ = uploadsQ.eq("section", scope.key);
    else if (scope.kind === "custom")
      uploadsQ = uploadsQ.eq("custom_section_id", scope.key);
    // For smart scope, uploads don't carry smart_section directly — we
    // depend on memory_items below to do that filtering and skip uploads.
    if (scope.kind === "smart")
      uploadsQ = uploadsQ.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const uploadsRes = await uploadsQ
    .order("created_at", { ascending: false })
    .limit(40);

  type UploadRow = {
    id: string;
    title: string | null;
    filename: string;
    section: Section | null;
    custom_section_id: string | null;
    organization_id: string;
    created_at: string;
  };
  const uploads = (uploadsRes.data ?? []) as UploadRow[];
  const allowedOrgSet = new Set(allowedOrgIds);

  // Second pass: also include uploads whose extracted text matches, even if
  // the filename/title doesn't. Extractions are linked to uploads, so we
  // re-apply the org filter via the upload table below — but we first prune
  // the extraction set by joining to upload_id so we don't pull text from
  // other orgs into memory at all.
  const extractionMatchRes = await supabase
    .from("extractions")
    .select("upload_id, raw_text")
    .or(
      keywords
        .map((k) => `raw_text.ilike.*${k.replace(/[%,]/g, "")}*`)
        .join(","),
    )
    .limit(80);

  type ExtractionRow = { upload_id: string; raw_text: string | null };
  const extractionMatches = (extractionMatchRes.data ?? []) as ExtractionRow[];

  // -- Verify each extraction belongs to an allowed org --------------------
  // RLS already prevents reads of other orgs' extractions for non-members,
  // but the user IS a member of multiple orgs. Filter strictly by upload's
  // organization_id below.
  const extractionUploadIds = Array.from(
    new Set(extractionMatches.map((e) => e.upload_id)),
  );
  const allowedExtractionUploadIds = new Set<string>();
  if (extractionUploadIds.length > 0) {
    const verifyRes = await supabase
      .from("uploads")
      .select("id, organization_id")
      .in("id", extractionUploadIds)
      .in("organization_id", allowedOrgIds);
    for (const row of (verifyRes.data ?? []) as {
      id: string;
      organization_id: string;
    }[]) {
      if (allowedOrgSet.has(row.organization_id)) {
        allowedExtractionUploadIds.add(row.id);
      }
    }
  }
  const extractionByUpload = new Map<string, string>();
  for (const e of extractionMatches) {
    if (allowedExtractionUploadIds.has(e.upload_id)) {
      extractionByUpload.set(e.upload_id, e.raw_text ?? "");
    }
  }

  // Fetch the upload rows referenced only by extraction matches.
  const uploadIdsKnown = new Set(uploads.map((u) => u.id));
  const extraOnly = Array.from(extractionByUpload.keys()).filter(
    (id) => !uploadIdsKnown.has(id),
  );
  if (extraOnly.length > 0) {
    const more = await supabase
      .from("uploads")
      .select(
        "id, title, filename, section, custom_section_id, organization_id, created_at",
      )
      .in("id", extraOnly)
      .in("organization_id", allowedOrgIds)
      .is("deleted_at", null);
    for (const u of (more.data ?? []) as UploadRow[]) {
      uploads.push(u);
    }
  }

  // Also pull extractions for the title/filename-matched uploads so the
  // snippet shown to Claude carries actual content, not just a name. We
  // can fetch by upload_id directly — those uploads were already org-
  // verified above.
  const missingExtractionIds = uploads
    .map((u) => u.id)
    .filter((id) => !extractionByUpload.has(id));
  if (missingExtractionIds.length > 0) {
    const more = await supabase
      .from("extractions")
      .select("upload_id, raw_text")
      .in("upload_id", missingExtractionIds);
    for (const e of (more.data ?? []) as ExtractionRow[]) {
      extractionByUpload.set(e.upload_id, e.raw_text ?? "");
    }
  }

  // -- Memory items (per-receipt rows) ----------------------------------------
  // Match against title, merchant, summary, location, raw_text. Each item
  // becomes its own source so the user can ask "find the Hermès invoice" and
  // get the specific receipt, not just the photo that contains it.
  const itemFilter = keywords
    .map((k) => {
      const safe = k.replace(/[%,]/g, "");
      return [
        `title.ilike.*${safe}*`,
        `merchant.ilike.*${safe}*`,
        `summary.ilike.*${safe}*`,
        `location.ilike.*${safe}*`,
        `raw_text.ilike.*${safe}*`,
        `category.ilike.*${safe}*`,
      ].join(",");
    })
    .join(",");

  let itemsQ = supabase
    .from("memory_items")
    .select(
      "id, upload_id, organization_id, title, summary, merchant, amount_value, amount_currency, occurred_at, location, category, section, raw_text, created_at, smart_section, calories, protein_g, carbs_g, fat_g, is_recurring, recurring_interval, direction",
    )
    .is("deleted_at", null)
    .in("organization_id", allowedOrgIds);
  if (keywords.length > 0) itemsQ = itemsQ.or(itemFilter);
  if (scope) {
    if (scope.kind === "builtin") itemsQ = itemsQ.eq("section", scope.key);
    else if (scope.kind === "custom")
      itemsQ = itemsQ.eq("custom_section_id", scope.key);
    else itemsQ = itemsQ.eq("smart_section", scope.key);
  }
  const itemsRes = await itemsQ
    .order("created_at", { ascending: false })
    .limit(20);

  type ItemRow = {
    id: string;
    upload_id: string | null;
    organization_id: string;
    title: string;
    summary: string | null;
    merchant: string | null;
    amount_value: string | null;
    amount_currency: string | null;
    occurred_at: string | null;
    location: string | null;
    category: string | null;
    section: Section | null;
    raw_text: string | null;
    created_at: string;
    smart_section: string | null;
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    is_recurring: boolean | null;
    recurring_interval: string | null;
    direction: "inflow" | "outflow" | null;
  };
  const items = (itemsRes.data ?? []) as ItemRow[];

  // -- Aggregate second pass --------------------------------------------------
  // "How much did I spend?" / "calories today" / "show my meals this week"
  // don't match on keywords. Pull items with the relevant numeric field
  // populated in the active scope so the agent has data to sum, even
  // when nothing keyword-hit.
  if (intent.isAggregate) {
    const seenIds = new Set(items.map((i) => i.id));
    const fields: Array<"amount_normalized" | "calories"> = [];
    if (intent.wantsAmounts || (!intent.wantsAmounts && !intent.wantsMacros)) {
      fields.push("amount_normalized");
    }
    if (intent.wantsMacros) fields.push("calories");
    const aggregateResults = await Promise.all(
      fields.map((field) =>
        buildAggregateQuery({
          supabase,
          allowedOrgIds,
          scope,
          sinceISO: intent.sinceISO,
          field,
        }),
      ),
    );
    for (const rows of aggregateResults) {
      for (const row of rows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        items.push(row);
      }
    }
  }

  // -- Reminders -------------------------------------------------------------
  const reminderFilter = keywords
    .map((k) => `title.ilike.*${k.replace(/[%,]/g, "")}*`)
    .join(",");
  let remindersQ = supabase
    .from("reminders")
    .select("id, title, due_at, upload_id, organization_id, done, created_at")
    .in("organization_id", allowedOrgIds);
  if (keywords.length > 0) remindersQ = remindersQ.or(reminderFilter);
  if (scope) {
    // Reminders aren't sectioned today. When scoped, the safest behaviour
    // is to skip them entirely — the section-scoped agent should answer
    // only from section-scoped sources.
    remindersQ = remindersQ.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const remindersRes = await remindersQ.limit(20);

  type ReminderRow = {
    id: string;
    title: string;
    due_at: string | null;
    upload_id: string | null;
    organization_id: string;
    done: boolean;
    created_at: string;
  };
  const reminders = (remindersRes.data ?? []) as ReminderRow[];

  // -- Score + build sources -------------------------------------------------
  type Scored = { score: number; src: Omit<RetrievedSource, "id"> };
  const scored: Scored[] = [];

  for (const u of uploads) {
    // Defence in depth: skip anything that somehow snuck through. Cheap.
    if (!allowedOrgSet.has(u.organization_id)) continue;
    const extractedText = extractionByUpload.get(u.id) ?? "";
    const haystack = [u.title ?? "", u.filename, extractedText]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    if (score === 0) continue;
    const space = spaceById.get(u.organization_id);
    const isPending = extractedText.length === 0;
    scored.push({
      score,
      src: {
        kind: "upload",
        title: u.title || u.filename,
        snippet: isPending
          ? "Oria is still reading this file. Details aren't available yet."
          : buildUploadSnippet(extractedText, keywords),
        href: `/dashboard/uploads/${u.id}`,
        processing_state: isPending ? "pending" : "ready",
        meta: {
          section_label: u.section
            ? sectionLabel(u.section as Section)
            : null,
          space_name: space?.name ?? ctx.organization.name,
          date_label: friendlyDate(u.created_at),
        },
      },
    });
  }

  for (const it of items) {
    if (!allowedOrgSet.has(it.organization_id)) continue;
    const haystack = [
      it.title,
      it.merchant ?? "",
      it.summary ?? "",
      it.location ?? "",
      it.category ?? "",
      it.raw_text ?? "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    // Aggregate intent: items pulled in the second pass don't keyword-
    // match, but they ARE relevant — give them a base score so they
    // survive the filter and the agent can sum across them.
    if (score === 0 && intent.isAggregate) {
      const hasAmount = typeof it.amount_value === "string" && it.amount_value.length > 0;
      const hasMacros = typeof it.calories === "number" && it.calories > 0;
      if ((intent.wantsAmounts && hasAmount) || (intent.wantsMacros && hasMacros) || (hasAmount && !intent.wantsMacros)) {
        score = 3; // base relevance for roll-up
      }
    }
    if (score === 0) continue;
    // Boost items that carry structured fields — they're more likely to be
    // the "right" answer than a vaguely-matching raw upload.
    if (it.merchant || it.amount_value) score += 4;
    const space = spaceById.get(it.organization_id);
    scored.push({
      score,
      src: {
        kind: "upload",
        title: it.title,
        snippet: buildItemSnippet(it, keywords),
        href: it.upload_id
          ? `/dashboard/uploads/${it.upload_id}`
          : "/dashboard",
        processing_state: "ready",
        meta: {
          section_label: it.section
            ? sectionLabel(it.section as Section)
            : it.category,
          space_name: space?.name ?? ctx.organization.name,
          date_label: it.occurred_at
            ? friendlyDate(it.occurred_at)
            : friendlyDate(it.created_at),
        },
      },
    });
  }

  for (const r of reminders) {
    if (!allowedOrgSet.has(r.organization_id)) continue;
    const haystack = r.title.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    if (score === 0) continue;
    const space = spaceById.get(r.organization_id);
    scored.push({
      score,
      src: {
        kind: "reminder",
        title: r.title,
        snippet: r.done
          ? "Done"
          : r.due_at
            ? `Due ${friendlyDate(r.due_at)}`
            : "No date set",
        href: r.upload_id
          ? `/dashboard/uploads/${r.upload_id}`
          : "/dashboard/calendar",
        processing_state: "ready",
        meta: {
          section_label: null,
          space_name: space?.name ?? ctx.organization.name,
          date_label: r.due_at ? friendlyDate(r.due_at) : null,
        },
      },
    });
  }

  // Saved section memories always join the pool so the agent has them as
  // grounded context, even if no keyword matched the memory text.
  for (const m of memoryRows) scored.push(m);

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSources).map((s, i) => ({ id: i + 1, ...s.src }));
}

/**
 * Build a small text snippet around the most informative keyword hit. Keeps
 * the prompt window cheap and the citation grounded in the matched passage.
 */
function buildUploadSnippet(rawText: string, keywords: string[]): string {
  const text = (rawText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(no extracted text)";
  const lower = text.toLowerCase();
  // Pick the earliest keyword match; show ±240 chars around it.
  let bestIdx = -1;
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return text.slice(0, 600);
  const start = Math.max(0, bestIdx - 200);
  const end = Math.min(text.length, bestIdx + 400);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

type ItemSnippetSource = {
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  occurred_at: string | null;
  location: string | null;
  summary: string | null;
  raw_text: string | null;
  smart_section?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  is_recurring?: boolean | null;
  recurring_interval?: string | null;
  direction?: "inflow" | "outflow" | null;
};

/**
 * Compose a tight snippet for memory_items. Leads with the structured facts
 * (merchant, amount, date, location) the user actually asked about, then
 * folds in smart-section specifics — calories/macros for diet items,
 * recurrence/direction for bills — so the agent can answer "how many
 * calories today?" or "what are my recurring bills?" with real numbers.
 * Falls back to summary / raw text when structured fields are sparse.
 */
function buildItemSnippet(it: ItemSnippetSource, keywords: string[]): string {
  const parts: string[] = [];
  if (it.merchant) parts.push(it.merchant);
  if (it.amount_value) {
    parts.push(
      it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value,
    );
  }
  if (it.occurred_at) parts.push(friendlyDate(it.occurred_at));
  if (it.location) parts.push(it.location);
  const head = parts.join(" · ");

  // Smart-section facts: a one-line "tags" segment after the head.
  const tags: string[] = [];
  if (it.smart_section === "diet") {
    if (typeof it.calories === "number") {
      tags.push(`${Math.round(it.calories)} cal`);
    }
    const macros: string[] = [];
    if (typeof it.protein_g === "number")
      macros.push(`${Math.round(it.protein_g)}g protein`);
    if (typeof it.carbs_g === "number")
      macros.push(`${Math.round(it.carbs_g)}g carbs`);
    if (typeof it.fat_g === "number")
      macros.push(`${Math.round(it.fat_g)}g fat`);
    if (macros.length > 0) tags.push(macros.join(", "));
  }
  if (it.smart_section === "bills" || it.is_recurring) {
    if (it.is_recurring) {
      tags.push(
        it.recurring_interval
          ? `recurring ${it.recurring_interval.toLowerCase()}`
          : "recurring",
      );
    }
    if (it.direction) tags.push(it.direction);
  }
  const tagLine = tags.join(" · ");

  const body = it.summary
    ? it.summary
    : it.raw_text
      ? buildUploadSnippet(it.raw_text, keywords)
      : "";

  const lines = [head, tagLine, body].filter((s) => s && s.length > 0);
  return lines.join("\n");
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type AggregateRow = {
  id: string;
  upload_id: string | null;
  organization_id: string;
  title: string;
  summary: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  occurred_at: string | null;
  location: string | null;
  category: string | null;
  section: Section | null;
  raw_text: string | null;
  created_at: string;
  smart_section: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  is_recurring: boolean | null;
  recurring_interval: string | null;
  direction: "inflow" | "outflow" | null;
};

/**
 * Broaden-the-pool query for aggregate intent. Pulls memory_items where
 * the requested numeric column is populated, scoped to the same orgs (and
 * optional section / time window) as the main retrieval. Returns rows
 * directly so the caller doesn't have to thread a complex generic type
 * back through the supabase builder (which deepens TS recursion).
 */
async function buildAggregateQuery(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  allowedOrgIds: string[];
  scope: SectionScope | null;
  sinceISO: string | null;
  field: "amount_normalized" | "calories";
}): Promise<AggregateRow[]> {
  let q = args.supabase
    .from("memory_items")
    .select(
      "id, upload_id, organization_id, title, summary, merchant, amount_value, amount_currency, occurred_at, location, category, section, raw_text, created_at, smart_section, calories, protein_g, carbs_g, fat_g, is_recurring, recurring_interval, direction",
    )
    .is("deleted_at", null)
    .in("organization_id", args.allowedOrgIds)
    .not(args.field, "is", null);
  if (args.scope) {
    if (args.scope.kind === "builtin") q = q.eq("section", args.scope.key);
    else if (args.scope.kind === "custom")
      q = q.eq("custom_section_id", args.scope.key);
    else q = q.eq("smart_section", args.scope.key);
  }
  if (args.sinceISO) q = q.gte("occurred_at", args.sinceISO);
  const { data } = await q
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(60);
  return (data ?? []) as AggregateRow[];
}
